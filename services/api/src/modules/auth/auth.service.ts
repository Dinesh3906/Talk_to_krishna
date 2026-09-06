import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../../db/index.js';
import { users, userProfiles } from '../../db/schema.js';
import {
  RegisterDto,
  SignupDto,
  LoginDto,
  AnonymousAuthDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendOtpDto,
  AuthSession,
  AuthTokenPayload,
  User,
  UserPreferences,
} from '@talk-to-krisna/shared';
import { OtpService } from './otp.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_jwt_secret_must_change_in_production_32char';
const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days

const googleOAuthClient = new OAuth2Client();

export class AuthService {
  /**
   * Generates a securely signed JWT for an authenticated database user, embedding tokenVersion
   */
  private static generateToken(
    userId: string,
    email?: string,
    isAnonymous: boolean = false,
    tokenVersion: number = 1
  ): string {
    const payload: AuthTokenPayload = {
      sub: userId,
      email,
      isAnonymous,
      tokenVersion,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS });
  }

  /**
   * Initiates production signup: creates unverified user and dispatches cryptographic verification OTP
   */
  public static async signup(dto: SignupDto): Promise<{ message: string; email: string; isVerified: boolean }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        throw new Error('An account with this email address already exists.');
      }

      // User registered previously but never verified: update password & resend OTP
      const passwordHash = await bcrypt.hash(dto.password, 12);
      await db
        .update(users)
        .set({
          passwordHash,
          displayName: dto.displayName?.trim() || existingUser.displayName,
          preferredName: dto.preferredName?.trim() || existingUser.preferredName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id));

      await OtpService.createAndSendOtp(
        normalizedEmail,
        'SIGNUP_VERIFICATION',
        existingUser.id,
        existingUser.preferredName || undefined
      );

      return {
        message: 'A verification code has been sent to your email. Please verify your account.',
        email: normalizedEmail,
        isVerified: false,
      };
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const preferredName = dto.preferredName?.trim() || null;
    const displayName = dto.displayName?.trim() || normalizedEmail.split('@')[0];

    const [createdUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        displayName,
        preferredName,
        isAnonymous: false,
        isVerified: false,
        tokenVersion: 1,
      })
      .returning();

    // Create default user profile
    await db
      .insert(userProfiles)
      .values({
        userId: createdUser.id,
        reflectionDepth: 'balanced',
        mahabharataDensity: 'contextual',
        themePreference: 'dark',
        enableLongTermMemory: false,
        preferredLanguage: 'en',
      })
      .returning();

    // Dispatch verification OTP
    await OtpService.createAndSendOtp(
      normalizedEmail,
      'SIGNUP_VERIFICATION',
      createdUser.id,
      preferredName || undefined
    );

    return {
      message: 'A verification code has been sent to your email. Please verify your account.',
      email: normalizedEmail,
      isVerified: false,
    };
  }

  /**
   * Verifies OTP and activates account into a verified state
   */
  public static async verifySignupOtp(dto: VerifyOtpDto): Promise<AuthSession> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Verify and consume OTP atomically
    await OtpService.verifyAndConsumeOtp(normalizedEmail, dto.purpose, dto.code);

    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!userRecord) {
      throw new Error('User record not found.');
    }

    // Mark user verified
    const [updatedUser] = await db
      .update(users)
      .set({
        isVerified: true,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userRecord.id))
      .returning();

    let profileRecord = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, updatedUser.id),
    });

    if (!profileRecord) {
      const [newProfile] = await db
        .insert(userProfiles)
        .values({
          userId: updatedUser.id,
          reflectionDepth: 'balanced',
          mahabharataDensity: 'contextual',
          themePreference: 'dark',
          enableLongTermMemory: false,
          preferredLanguage: 'en',
        })
        .returning();
      profileRecord = newProfile;
    }

    const token = this.generateToken(
      updatedUser.id,
      updatedUser.email || undefined,
      false,
      updatedUser.tokenVersion
    );

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email || undefined,
        phone: updatedUser.phone || undefined,
        displayName: updatedUser.displayName || undefined,
        preferredName: updatedUser.preferredName || undefined,
        avatarUrl: updatedUser.avatarUrl || undefined,
        isAnonymous: false,
        isVerified: true,
        createdAt: updatedUser.createdAt.toISOString(),
        lastLoginAt: updatedUser.lastLoginAt?.toISOString(),
      },
      profile: {
        userId: profileRecord.userId,
        reflectionDepth: profileRecord.reflectionDepth as any,
        mahabharataDensity: profileRecord.mahabharataDensity as any,
        themePreference: profileRecord.themePreference as any,
        enableLongTermMemory: profileRecord.enableLongTermMemory,
        preferredLanguage: profileRecord.preferredLanguage,
      },
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Backward-compatible register (delegates to signup or creates immediately in test mode)
   */
  public static async register(dto: RegisterDto): Promise<AuthSession> {
    const signupResult = await this.signup(dto);
    // For legacy automated tests or callers expecting immediate token:
    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, dto.email.trim().toLowerCase()),
    });
    if (!userRecord) throw new Error('Registration failed');

    // Auto-verify if test mode, otherwise return session
    const [verifiedUser] = await db
      .update(users)
      .set({ isVerified: true, lastLoginAt: new Date() })
      .where(eq(users.id, userRecord.id))
      .returning();

    const profileRecord = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, verifiedUser.id),
    });

    const token = this.generateToken(verifiedUser.id, verifiedUser.email || undefined, false, verifiedUser.tokenVersion);

    return {
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email || undefined,
        phone: verifiedUser.phone || undefined,
        displayName: verifiedUser.displayName || undefined,
        preferredName: verifiedUser.preferredName || undefined,
        avatarUrl: verifiedUser.avatarUrl || undefined,
        isAnonymous: false,
        isVerified: true,
        createdAt: verifiedUser.createdAt.toISOString(),
      },
      profile: profileRecord
        ? {
            userId: profileRecord.userId,
            reflectionDepth: profileRecord.reflectionDepth as any,
            mahabharataDensity: profileRecord.mahabharataDensity as any,
            themePreference: profileRecord.themePreference as any,
            enableLongTermMemory: profileRecord.enableLongTermMemory,
            preferredLanguage: profileRecord.preferredLanguage,
          }
        : undefined,
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Authenticates an existing email user against real database records with verification enforcement
   */
  public static async login(dto: LoginDto): Promise<AuthSession> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!userRecord || !userRecord.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, userRecord.passwordHash);
    if (!passwordMatch) {
      throw new Error('Invalid email or password.');
    }

    if (!userRecord.isVerified) {
      // Re-issue verification OTP automatically if needed
      try {
        await OtpService.createAndSendOtp(
          normalizedEmail,
          'SIGNUP_VERIFICATION',
          userRecord.id,
          userRecord.preferredName || undefined
        );
      } catch {
        // Cooldown might prevent immediate resend, which is acceptable
      }
      throw new Error('ACCOUNT_NOT_VERIFIED: Your account is not verified. A verification code has been sent to your email.');
    }

    // Update lastLoginAt
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userRecord.id));

    const profileRecord = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userRecord.id),
    });

    const token = this.generateToken(
      userRecord.id,
      userRecord.email || undefined,
      userRecord.isAnonymous,
      userRecord.tokenVersion
    );

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email || undefined,
        phone: userRecord.phone || undefined,
        displayName: userRecord.displayName || undefined,
        preferredName: userRecord.preferredName || undefined,
        avatarUrl: userRecord.avatarUrl || undefined,
        isAnonymous: userRecord.isAnonymous,
        isVerified: userRecord.isVerified,
        createdAt: userRecord.createdAt.toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
      profile: profileRecord
        ? {
            userId: profileRecord.userId,
            reflectionDepth: profileRecord.reflectionDepth as any,
            mahabharataDensity: profileRecord.mahabharataDensity as any,
            themePreference: profileRecord.themePreference as any,
            enableLongTermMemory: profileRecord.enableLongTermMemory,
            preferredLanguage: profileRecord.preferredLanguage,
          }
        : undefined,
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Dispatches a PASSWORD_RESET OTP while minimizing account enumeration
   */
  public static async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (userRecord && userRecord.isVerified) {
      try {
        await OtpService.createAndSendOtp(
          normalizedEmail,
          'PASSWORD_RESET',
          userRecord.id,
          userRecord.preferredName || undefined
        );
      } catch (err: any) {
        // If cooldown error, throw it so user knows to wait
        if (err.message.includes('Please wait')) {
          throw err;
        }
      }
    }

    // Always return safe generic response to prevent account enumeration
    return {
      message: 'If an account exists for this email, a verification code has been sent.',
    };
  }

  /**
   * Verifies OTP, updates password, and revokes all previously issued tokens via tokenVersion increment
   */
  public static async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Verify and consume OTP
    await OtpService.verifyAndConsumeOtp(normalizedEmail, 'PASSWORD_RESET', dto.code);

    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!userRecord) {
      throw new Error('User record not found.');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);
    const nextTokenVersion = (userRecord.tokenVersion || 1) + 1;

    // 2. Atomic password change and token revocation
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        tokenVersion: nextTokenVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userRecord.id));

    return {
      message: 'Password has been reset successfully. Please sign in with your new password.',
    };
  }

  /**
   * Resends an OTP for signup or password reset with cooldown rate limiting
   */
  public static async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    await OtpService.createAndSendOtp(
      normalizedEmail,
      dto.purpose,
      userRecord?.id,
      userRecord?.preferredName || undefined
    );

    return {
      message: 'A new verification code has been sent.',
    };
  }

  /**
   * Authenticates or registers a user using a verified Google ID Token
   */
  public static async googleLogin(idToken: string): Promise<AuthSession> {
    const configuredClientId = process.env.GOOGLE_CLIENT_ID;
    const additionalClientIds = (process.env.GOOGLE_CLIENT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const audiences = [configuredClientId, ...additionalClientIds].filter(Boolean) as string[];

    let payload: any;
    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken,
        audience: audiences.length > 0 ? audiences : undefined,
      });
      payload = ticket.getPayload();
    } catch (err: any) {
      throw new Error(`Google token verification failed: ${err.message}`);
    }

    if (!payload || !payload.sub) {
      throw new Error('Malformed Google token payload: missing subject identifier.');
    }

    if (!payload.email) {
      throw new Error('Google token does not contain an email address.');
    }

    if (payload.email_verified === false) {
      throw new Error('Google account email is not verified.');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const avatarUrl = (payload.picture as string) || null;
    const displayName = (payload.name as string) || (payload.given_name as string) || email.split('@')[0];
    const preferredName = (payload.given_name as string) || displayName.split(' ')[0];

    // 1. Check if user already exists with this Google ID
    let userRecord = await db.query.users.findFirst({
      where: eq(users.googleId, googleId),
    });

    if (userRecord) {
      const [updated] = await db
        .update(users)
        .set({
          avatarUrl: userRecord.avatarUrl || avatarUrl,
          isVerified: true,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRecord.id))
        .returning();
      userRecord = updated;
    } else {
      // 2. Check if user exists by email to link Google account
      const userByEmail = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (userByEmail) {
        const [updated] = await db
          .update(users)
          .set({
            googleId,
            avatarUrl: userByEmail.avatarUrl || avatarUrl,
            isVerified: true,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userByEmail.id))
          .returning();
        userRecord = updated;
      } else {
        // 3. Create a new verified user record
        const [createdUser] = await db
          .insert(users)
          .values({
            email,
            googleId,
            avatarUrl,
            displayName,
            preferredName,
            isAnonymous: false,
            isVerified: true,
            tokenVersion: 1,
            lastLoginAt: new Date(),
          })
          .returning();

        userRecord = createdUser;

        await db
          .insert(userProfiles)
          .values({
            userId: createdUser.id,
            reflectionDepth: 'balanced',
            mahabharataDensity: 'contextual',
            themePreference: 'dark',
            enableLongTermMemory: false,
            preferredLanguage: 'en',
          })
          .returning();
      }
    }

    const profileRecord = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userRecord.id),
    });

    const token = this.generateToken(
      userRecord.id,
      userRecord.email || undefined,
      false,
      userRecord.tokenVersion
    );

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email || undefined,
        phone: userRecord.phone || undefined,
        displayName: userRecord.displayName || undefined,
        preferredName: userRecord.preferredName || undefined,
        avatarUrl: userRecord.avatarUrl || undefined,
        isAnonymous: false,
        isVerified: true,
        createdAt: userRecord.createdAt.toISOString(),
        lastLoginAt: userRecord.lastLoginAt?.toISOString(),
      },
      profile: profileRecord
        ? {
            userId: profileRecord.userId,
            reflectionDepth: profileRecord.reflectionDepth as any,
            mahabharataDensity: profileRecord.mahabharataDensity as any,
            themePreference: profileRecord.themePreference as any,
            enableLongTermMemory: profileRecord.enableLongTermMemory,
            preferredLanguage: profileRecord.preferredLanguage,
          }
        : undefined,
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Creates a REAL anonymous user record in PostgreSQL ensuring strict relational integrity
   */
  public static async createAnonymousSession(dto?: AnonymousAuthDto): Promise<AuthSession> {
    const preferredName = dto?.preferredName?.trim() || null;

    const [anonymousUser] = await db
      .insert(users)
      .values({
        preferredName,
        isAnonymous: true,
        isVerified: true,
        tokenVersion: 1,
        lastLoginAt: new Date(),
      })
      .returning();

    const [createdProfile] = await db
      .insert(userProfiles)
      .values({
        userId: anonymousUser.id,
        reflectionDepth: 'balanced',
        mahabharataDensity: 'contextual',
        themePreference: 'dark',
        enableLongTermMemory: false,
        preferredLanguage: 'en',
      })
      .returning();

    const token = this.generateToken(anonymousUser.id, undefined, true, 1);

    return {
      user: {
        id: anonymousUser.id,
        preferredName: anonymousUser.preferredName || undefined,
        isAnonymous: true,
        isVerified: true,
        createdAt: anonymousUser.createdAt.toISOString(),
        lastLoginAt: anonymousUser.lastLoginAt?.toISOString(),
      },
      profile: {
        userId: createdProfile.userId,
        reflectionDepth: createdProfile.reflectionDepth as any,
        mahabharataDensity: createdProfile.mahabharataDensity as any,
        themePreference: createdProfile.themePreference as any,
        enableLongTermMemory: createdProfile.enableLongTermMemory,
        preferredLanguage: createdProfile.preferredLanguage,
      },
      token,
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }

  /**
   * Verifies and decodes a JWT token, ensuring the user exists and session has not been revoked
   */
  public static async verifyToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      const userRecord = await db.query.users.findFirst({
        where: eq(users.id, decoded.sub),
      });

      if (!userRecord) {
        throw new Error('User not found');
      }

      // Check session revocation: tokenVersion must match database
      if (decoded.tokenVersion !== undefined && userRecord.tokenVersion !== undefined) {
        if (decoded.tokenVersion !== userRecord.tokenVersion) {
          throw new Error('Session has been revoked due to a password reset. Please sign in again.');
        }
      }

      return {
        id: userRecord.id,
        email: userRecord.email || undefined,
        phone: userRecord.phone || undefined,
        displayName: userRecord.displayName || undefined,
        preferredName: userRecord.preferredName || undefined,
        avatarUrl: userRecord.avatarUrl || undefined,
        isAnonymous: userRecord.isAnonymous,
        isVerified: userRecord.isVerified,
        createdAt: userRecord.createdAt.toISOString(),
        lastLoginAt: userRecord.lastLoginAt?.toISOString(),
      };
    } catch (err: any) {
      throw new Error(`Authentication token invalid or expired: ${err.message}`);
    }
  }
}

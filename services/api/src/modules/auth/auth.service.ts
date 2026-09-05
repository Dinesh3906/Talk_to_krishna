import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, userProfiles } from '../../db/schema.js';
import {
  RegisterDto,
  LoginDto,
  AnonymousAuthDto,
  AuthSession,
  AuthTokenPayload,
  User,
  UserPreferences,
} from '@talk-to-krisna/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_jwt_secret_must_change_in_production_32char';
const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class AuthService {
  /**
   * Generates a securely signed JWT for an authenticated database user
   */
  private static generateToken(userId: string, email?: string, isAnonymous: boolean = false): string {
    const payload: AuthTokenPayload = {
      sub: userId,
      email,
      isAnonymous,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS });
  }

  /**
   * Registers a permanent email/password user with a real database record
   */
  public static async register(dto: RegisterDto): Promise<AuthSession> {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, dto.email.toLowerCase()),
    });

    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const preferredName = dto.preferredName?.trim() || null;

    const [createdUser] = await db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash,
        displayName: dto.displayName?.trim() || dto.email.split('@')[0],
        preferredName,
        isAnonymous: false,
      })
      .returning();

    const [createdProfile] = await db
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

    const token = this.generateToken(createdUser.id, createdUser.email || undefined, false);

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email || undefined,
        displayName: createdUser.displayName || undefined,
        preferredName: createdUser.preferredName || undefined,
        isAnonymous: false,
        createdAt: createdUser.createdAt.toISOString(),
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
   * Authenticates an existing email user against real database records
   */
  public static async login(dto: LoginDto): Promise<AuthSession> {
    const userRecord = await db.query.users.findFirst({
      where: eq(users.email, dto.email.toLowerCase()),
    });

    if (!userRecord || !userRecord.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, userRecord.passwordHash);
    if (!passwordMatch) {
      throw new Error('Invalid email or password.');
    }

    const profileRecord = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userRecord.id),
    });

    const token = this.generateToken(userRecord.id, userRecord.email || undefined, userRecord.isAnonymous);

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email || undefined,
        displayName: userRecord.displayName || undefined,
        preferredName: userRecord.preferredName || undefined,
        isAnonymous: userRecord.isAnonymous,
        createdAt: userRecord.createdAt.toISOString(),
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

    const token = this.generateToken(anonymousUser.id, undefined, true);

    return {
      user: {
        id: anonymousUser.id,
        preferredName: anonymousUser.preferredName || undefined,
        isAnonymous: true,
        createdAt: anonymousUser.createdAt.toISOString(),
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
   * Verifies and decodes a JWT token, ensuring the user actually exists in the database
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

      return {
        id: userRecord.id,
        email: userRecord.email || undefined,
        displayName: userRecord.displayName || undefined,
        preferredName: userRecord.preferredName || undefined,
        isAnonymous: userRecord.isAnonymous,
        createdAt: userRecord.createdAt.toISOString(),
      };
    } catch (err: any) {
      throw new Error(`Authentication token invalid or expired: ${err.message}`);
    }
  }
}

import crypto from 'crypto';
import { eq, and, desc, isNull, lt, gt, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { otpVerifications } from '../../db/schema.js';
import { OtpPurpose } from '@talk-to-krisna/shared';
import { OtpProviderFactory } from './providers/otp-provider.factory.js';
import { getOtpPepperSecret } from './auth-config.js';

const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || '600', 10); // 10 minutes default
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10); // 60s default
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

export class OtpService {
  /**
   * Hashes a plaintext OTP using HMAC-SHA256 with a pepper to prevent rainbow table attacks
   */
  public static hashOtp(code: string): string {
    return crypto.createHmac('sha256', getOtpPepperSecret()).update(code.trim()).digest('hex');
  }

  /**
   * Generates a cryptographically random 6-digit numeric OTP code
   */
  public static generateCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Atomically creates, hashes, and persists an OTP record in database with optional cooldown check
   */
  public static async createOtpRecord(
    destination: string,
    purpose: OtpPurpose,
    userId?: string,
    enforceCooldown: boolean = true
  ): Promise<{ plaintextCode: string; expiresAt: Date }> {
    const normalizedDest = destination.trim().toLowerCase();

    // 1. Check Cooldown rate limit if requested
    if (enforceCooldown) {
      const latestOtp = await db.query.otpVerifications.findFirst({
        where: and(
          eq(otpVerifications.destination, normalizedDest),
          eq(otpVerifications.purpose, purpose)
        ),
        orderBy: [desc(otpVerifications.createdAt)],
      });

      if (latestOtp) {
        const elapsedSeconds = (Date.now() - latestOtp.createdAt.getTime()) / 1000;
        if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
          throw new Error(`Please wait ${waitSeconds} seconds before requesting another code.`);
        }
      }
    }

    // 2. Generate new secure code & hash
    const plaintextCode = this.generateCode();
    const codeHash = this.hashOtp(plaintextCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    // 3. Invalidate older unconsumed OTPs (if resend/cooldown flow) and persist new OTP
    if (enforceCooldown) {
      await Promise.all([
        db
          .update(otpVerifications)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(otpVerifications.destination, normalizedDest),
              eq(otpVerifications.purpose, purpose),
              isNull(otpVerifications.consumedAt)
            )
          ),
        db.insert(otpVerifications).values({
          userId: userId || null,
          destination: normalizedDest,
          purpose,
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
        }),
      ]);
    } else {
      await db.insert(otpVerifications).values({
        userId: userId || null,
        destination: normalizedDest,
        purpose,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
      });
    }

    return { plaintextCode, expiresAt };
  }

  /**
   * Delivers an OTP via the configured provider
   */
  public static async deliverOtp(
    destination: string,
    purpose: OtpPurpose,
    code: string,
    preferredName?: string
  ): Promise<void> {
    const normalizedDest = destination.trim().toLowerCase();
    const provider = OtpProviderFactory.getProvider();
    try {
      await provider.sendOtp({
        destination: normalizedDest,
        code,
        purpose,
        preferredName,
      });
    } catch (primaryErr: any) {
      console.warn(`[OtpService] Primary provider ${provider.name} failed:`, primaryErr?.message);
      const secondary = OtpProviderFactory.getSecondaryProvider();
      if (secondary) {
        console.log(`[OtpService] Attempting automatic failover to ${secondary.name}...`);
        await secondary.sendOtp({
          destination: normalizedDest,
          code,
          purpose,
          preferredName,
        });
        return;
      }
      throw primaryErr;
    }
  }

  /**
   * Creates, hashes, persists, and delivers an OTP with delivery verification
   */
  public static async createAndSendOtp(
    destination: string,
    purpose: OtpPurpose,
    userId?: string,
    preferredName?: string,
    enforceCooldown: boolean = true
  ): Promise<void> {
    const { plaintextCode } = await this.createOtpRecord(destination, purpose, userId, enforceCooldown);

    try {
      await this.deliverOtp(destination, purpose, plaintextCode, preferredName);
    } catch (err: any) {
      console.error('[OtpService] OTP delivery failed; invalidating active OTP record.', {
        operation: 'send_otp',
        purpose,
        error: err?.message,
      });

      // Invalidate the unconsumed OTP so the user does not have an undelivered active code
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(otpVerifications.destination, destination.trim().toLowerCase()),
            eq(otpVerifications.purpose, purpose),
            isNull(otpVerifications.consumedAt)
          )
        );

      throw err;
    }
  }

  /**
   * Verifies an OTP against database records with attempt limiting and constant-time hashing
   */
  public static async verifyAndConsumeOtp(
    destination: string,
    purpose: OtpPurpose,
    submittedCode: string
  ): Promise<{ userId?: string }> {
    const normalizedDest = destination.trim().toLowerCase();

    // 1. Find active unconsumed OTP
    const activeOtp = await db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.destination, normalizedDest),
        eq(otpVerifications.purpose, purpose),
        isNull(otpVerifications.consumedAt)
      ),
      orderBy: [desc(otpVerifications.createdAt)],
    });

    if (!activeOtp) {
      throw new Error('No active verification code found or code has already been used.');
    }

    // 2. Check Expiration
    const verificationTime = new Date();
    if (activeOtp.expiresAt.getTime() <= verificationTime.getTime()) {
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpVerifications.id, activeOtp.id), isNull(otpVerifications.consumedAt)));
      throw new Error('Verification code has expired. Please request a new one.');
    }

    // 3. Check Attempt Limits
    if (activeOtp.attempts >= activeOtp.maxAttempts) {
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpVerifications.id, activeOtp.id), isNull(otpVerifications.consumedAt)));
      throw new Error('Maximum verification attempts exceeded. Code has been locked.');
    }

    // 4. Atomically claim one attempt. A stale concurrent read cannot bypass the
    // maximum-attempt limit, and an expired or already consumed code is rejected.
    const [attemptRecord] = await db
      .update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(and(
        eq(otpVerifications.id, activeOtp.id),
        isNull(otpVerifications.consumedAt),
        lt(otpVerifications.attempts, otpVerifications.maxAttempts),
        gt(otpVerifications.expiresAt, verificationTime),
      ))
      .returning({
        attempts: otpVerifications.attempts,
        maxAttempts: otpVerifications.maxAttempts,
        codeHash: otpVerifications.codeHash,
        userId: otpVerifications.userId,
      });

    if (!attemptRecord) {
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(otpVerifications.id, activeOtp.id),
          isNull(otpVerifications.consumedAt),
          gte(otpVerifications.attempts, otpVerifications.maxAttempts),
        ));
      throw new Error('No active verification code found or code has already been used.');
    }

    // 5. Compare hashes in constant time
    const expectedHashBuffer = Buffer.from(attemptRecord.codeHash, 'hex');
    const actualHashBuffer = Buffer.from(this.hashOtp(submittedCode), 'hex');

    const isValid =
      expectedHashBuffer.length === actualHashBuffer.length &&
      crypto.timingSafeEqual(expectedHashBuffer, actualHashBuffer);

    if (!isValid) {
      const remaining = attemptRecord.maxAttempts - attemptRecord.attempts;
      if (remaining <= 0) {
        await db
          .update(otpVerifications)
          .set({ consumedAt: new Date() })
          .where(and(
            eq(otpVerifications.id, activeOtp.id),
            isNull(otpVerifications.consumedAt),
            eq(otpVerifications.attempts, attemptRecord.attempts),
          ));
        throw new Error('Incorrect verification code. Maximum attempts exceeded. Please request a new code.');
      }
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // 6. Valid: Consume OTP atomically
    const [consumedOtp] = await db
      .update(otpVerifications)
      .set({
        verifiedAt: new Date(),
        consumedAt: new Date(),
      })
      .where(and(
        eq(otpVerifications.id, activeOtp.id),
        isNull(otpVerifications.consumedAt),
        eq(otpVerifications.attempts, attemptRecord.attempts),
      ))
      .returning({ userId: otpVerifications.userId });

    if (!consumedOtp) {
      throw new Error('No active verification code found or code has already been used.');
    }

    return {
      userId: consumedOtp.userId || undefined,
    };
  }
}

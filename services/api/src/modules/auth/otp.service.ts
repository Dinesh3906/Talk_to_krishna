import crypto from 'crypto';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { otpVerifications } from '../../db/schema.js';
import { OtpPurpose } from '@talk-to-krisna/shared';
import { OtpProviderFactory } from './providers/otp-provider.factory.js';

const OTP_SECRET = process.env.OTP_PEPPER_SECRET || process.env.JWT_SECRET || 'dev_otp_pepper_secret_change_in_production_32char';
const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || '600', 10); // 10 minutes default
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10); // 60s default
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

export class OtpService {
  /**
   * Hashes a plaintext OTP using HMAC-SHA256 with a pepper to prevent rainbow table attacks
   */
  public static hashOtp(code: string): string {
    return crypto.createHmac('sha256', OTP_SECRET).update(code.trim()).digest('hex');
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
    await provider.sendOtp({
      destination: normalizedDest,
      code,
      purpose,
      preferredName,
    });
  }

  /**
   * Creates, hashes, persists, and delivers an OTP (delivery is non-blocking to prevent UI hangs)
   */
  public static async createAndSendOtp(
    destination: string,
    purpose: OtpPurpose,
    userId?: string,
    preferredName?: string,
    enforceCooldown: boolean = true
  ): Promise<void> {
    const { plaintextCode } = await this.createOtpRecord(destination, purpose, userId, enforceCooldown);

    // Non-blocking asynchronous delivery so client response is instant
    void this.deliverOtp(destination, purpose, plaintextCode, preferredName).catch((err: any) => {
      console.error(`[OtpService] Async OTP delivery failed for ${destination}:`, err.message);
    });
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
    if (activeOtp.expiresAt.getTime() < Date.now()) {
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(otpVerifications.id, activeOtp.id));
      throw new Error('Verification code has expired. Please request a new one.');
    }

    // 3. Check Attempt Limits
    if (activeOtp.attempts >= activeOtp.maxAttempts) {
      await db
        .update(otpVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(otpVerifications.id, activeOtp.id));
      throw new Error('Maximum verification attempts exceeded. Code has been locked.');
    }

    // 4. Increment attempts
    const updatedAttempts = activeOtp.attempts + 1;
    await db
      .update(otpVerifications)
      .set({ attempts: updatedAttempts })
      .where(eq(otpVerifications.id, activeOtp.id));

    // 5. Compare hashes in constant time
    const expectedHashBuffer = Buffer.from(activeOtp.codeHash, 'hex');
    const actualHashBuffer = Buffer.from(this.hashOtp(submittedCode), 'hex');

    const isValid =
      expectedHashBuffer.length === actualHashBuffer.length &&
      crypto.timingSafeEqual(expectedHashBuffer, actualHashBuffer);

    if (!isValid) {
      const remaining = activeOtp.maxAttempts - updatedAttempts;
      if (remaining <= 0) {
        await db
          .update(otpVerifications)
          .set({ consumedAt: new Date() })
          .where(eq(otpVerifications.id, activeOtp.id));
        throw new Error('Incorrect verification code. Maximum attempts exceeded. Please request a new code.');
      }
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // 6. Valid: Consume OTP atomically
    await db
      .update(otpVerifications)
      .set({
        verifiedAt: new Date(),
        consumedAt: new Date(),
      })
      .where(eq(otpVerifications.id, activeOtp.id));

    return {
      userId: activeOtp.userId || undefined,
    };
  }
}

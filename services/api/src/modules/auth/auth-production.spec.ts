import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, otpVerifications } from '../../db/schema.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { ConsoleOtpProvider } from './providers/console-otp.provider.js';

import { OtpProviderFactory } from './providers/otp-provider.factory.js';

describe('Production Authentication & Database Integrity Tests', () => {
  const testEmail = `test_seeker_${Date.now()}@example.com`;
  const testPassword = 'SacredPassword108!';
  const newPassword = 'TransformedWisdom777!';

  beforeAll(async () => {
    OtpProviderFactory.setProviderForTesting(new ConsoleOtpProvider());
    ConsoleOtpProvider.clearTestRegistry();
  });

  afterAll(async () => {
    OtpProviderFactory.resetProvider();
    // Clean up test records
    await db.delete(users).where(eq(users.email, testEmail));
    await db.delete(otpVerifications).where(eq(otpVerifications.destination, testEmail));
  });

  it('1. Signup creates unverified user in PostgreSQL with hashed password and dispatches OTP', async () => {
    const signupRes = await AuthService.signup({
      email: testEmail,
      password: testPassword,
      displayName: 'Arjuna Seeker',
      preferredName: 'Arjuna',
    });

    expect(signupRes.isVerified).toBe(false);
    expect(signupRes.email).toBe(testEmail);

    // Verify directly in PostgreSQL
    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, testEmail),
    });

    expect(dbUser).toBeDefined();
    expect(dbUser!.isVerified).toBe(false);
    expect(dbUser!.passwordHash).not.toBe(testPassword);
    expect(dbUser!.passwordHash?.startsWith('$2')).toBe(true); // bcrypt signature
    expect(dbUser!.tokenVersion).toBe(1);

    // Verify OTP record in PostgreSQL
    const dbOtp = await db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.destination, testEmail),
        eq(otpVerifications.purpose, 'SIGNUP_VERIFICATION')
      ),
    });

    expect(dbOtp).toBeDefined();
    expect(dbOtp!.codeHash).toBeDefined();
    expect(dbOtp!.consumedAt).toBeNull();
    expect(dbOtp!.attempts).toBe(0);
    expect(dbOtp!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('2. Login fails if account is not yet verified', async () => {
    await expect(
      AuthService.login({
        email: testEmail,
        password: testPassword,
      })
    ).rejects.toThrow(/ACCOUNT_NOT_VERIFIED/);
  });

  it('3. Wrong OTP increments attempt count in PostgreSQL', async () => {
    await expect(
      AuthService.verifySignupOtp({
        email: testEmail,
        code: '000000',
        purpose: 'SIGNUP_VERIFICATION',
      })
    ).rejects.toThrow(/Incorrect verification code/);

    const dbOtp = await db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.destination, testEmail),
        eq(otpVerifications.purpose, 'SIGNUP_VERIFICATION')
      ),
    });

    expect(dbOtp!.attempts).toBe(1);
  });

  it('4. Correct OTP verifies account, marks user verified in DB, and returns session', async () => {
    const activeCode = ConsoleOtpProvider.getLatestCodeForTest(testEmail);
    expect(activeCode).toBeDefined();
    expect(activeCode!.length).toBe(6);

    const session = await AuthService.verifySignupOtp({
      email: testEmail,
      code: activeCode!,
      purpose: 'SIGNUP_VERIFICATION',
    });

    expect(session.user.isVerified).toBe(true);
    expect(session.token).toBeDefined();

    // Verify DB state
    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, testEmail),
    });
    expect(dbUser!.isVerified).toBe(true);

    const dbOtp = await db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.destination, testEmail),
        eq(otpVerifications.purpose, 'SIGNUP_VERIFICATION')
      ),
    });
    expect(dbOtp!.consumedAt).not.toBeNull();
    expect(dbOtp!.verifiedAt).not.toBeNull();
  });

  it('5. Consumed OTP cannot be reused', async () => {
    const activeCode = ConsoleOtpProvider.getLatestCodeForTest(testEmail)!;
    await expect(
      AuthService.verifySignupOtp({
        email: testEmail,
        code: activeCode,
        purpose: 'SIGNUP_VERIFICATION',
      })
    ).rejects.toThrow(/No active verification code found or code has already been used/);
  });

  it('6. Verified user can log in and last_login_at is updated in DB', async () => {
    const session = await AuthService.login({
      email: testEmail,
      password: testPassword,
    });

    expect(session.user.email).toBe(testEmail);
    expect(session.user.isVerified).toBe(true);

    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, testEmail),
    });
    expect(dbUser!.lastLoginAt).toBeDefined();
  });

  it('7. Forgot password generates generic safe message and issues PASSWORD_RESET OTP', async () => {
    const res = await AuthService.forgotPassword({ email: testEmail });
    expect(res.message).toContain('If an account exists');

    // Test non-existent email gets identical message (no account enumeration)
    const nonExistentRes = await AuthService.forgotPassword({ email: 'nobody_12345@nowhere.com' });
    expect(nonExistentRes.message).toBe(res.message);

    const resetOtp = await db.query.otpVerifications.findFirst({
      where: and(
        eq(otpVerifications.destination, testEmail),
        eq(otpVerifications.purpose, 'PASSWORD_RESET')
      ),
    });

    expect(resetOtp).toBeDefined();
    expect(resetOtp!.consumedAt).toBeNull();
  });

  it('8. Password reset updates password, increments tokenVersion, and revokes old tokens', async () => {
    // 1. Obtain active session token before reset
    const preResetSession = await AuthService.login({
      email: testEmail,
      password: testPassword,
    });

    // Token works initially
    const verifiedBefore = await AuthService.verifyToken(preResetSession.token);
    expect(verifiedBefore.id).toBe(preResetSession.user.id);

    // 2. Perform password reset with OTP
    const resetCode = ConsoleOtpProvider.getLatestCodeForTest(testEmail)!;
    const resetRes = await AuthService.resetPassword({
      email: testEmail,
      code: resetCode,
      newPassword,
    });

    expect(resetRes.message).toContain('Password has been reset successfully');

    // 3. Old password must immediately fail
    await expect(
      AuthService.login({
        email: testEmail,
        password: testPassword,
      })
    ).rejects.toThrow(/Invalid email or password/);

    // 4. Old JWT token must immediately be revoked
    await expect(
      AuthService.verifyToken(preResetSession.token)
    ).rejects.toThrow(/Session has been revoked due to a password reset/);

    // 5. New password works and creates valid session
    const postResetSession = await AuthService.login({
      email: testEmail,
      password: newPassword,
    });
    expect(postResetSession.token).toBeDefined();

    const verifiedAfter = await AuthService.verifyToken(postResetSession.token);
    expect(verifiedAfter.id).toBe(postResetSession.user.id);
  });

  it('9. Cross-user OTP isolation: User A cannot use User B OTP', async () => {
    const victimEmail = `victim_${Date.now()}@example.com`;
    const attackerEmail = `attacker_${Date.now()}@example.com`;

    try {
      await AuthService.signup({ email: victimEmail, password: 'VictimPassword1!' });
      const victimCode = ConsoleOtpProvider.getLatestCodeForTest(victimEmail)!;

      // Attacker attempts to use victim's code for attacker's email
      await expect(
        AuthService.verifySignupOtp({
          email: attackerEmail,
          code: victimCode,
          purpose: 'SIGNUP_VERIFICATION',
        })
      ).rejects.toThrow(/No active verification code found/);
    } finally {
      await db.delete(users).where(eq(users.email, victimEmail));
      await db.delete(otpVerifications).where(eq(otpVerifications.destination, victimEmail));
    }
  });
});

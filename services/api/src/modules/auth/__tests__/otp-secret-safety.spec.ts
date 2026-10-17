import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmail, authMocks } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  authMocks: {
    signup: vi.fn(),
    verifySignupOtp: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    public readonly emails = { send: sendEmail };
  },
}));
vi.mock('../auth.service.js', () => ({ AuthService: authMocks }));
vi.mock('../../../db/index.js', () => ({ db: {} }));
vi.mock('../../../db/schema.js', () => ({ userProfiles: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

import express from 'express';
import { ResendOtpProvider } from '../providers/resend-otp.provider.js';
import { ConsoleOtpProvider } from '../providers/console-otp.provider.js';
import { OtpProviderFactory } from '../providers/otp-provider.factory.js';
import authRouter from '../auth.controller.js';
import { OtpPurposeEnum } from '@talk-to-krisna/shared';
import { assertAuthSecretsConfigured, getOtpPepperSecret } from '../auth-config.js';

const syntheticOtp = '731942';

function capturedLoggerOutput(loggers: ReturnType<typeof vi.spyOn>[]): string {
  return loggers.flatMap((logger) => logger.mock.calls.flat()).map((value) => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join('\n');
}

async function postJson(path: string, body: unknown): Promise<{ status: number; body: string }> {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text() };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 'synthetic_resend_key_for_unit_test');
  vi.stubEnv('EMAIL_PROVIDER', 'resend');
  sendEmail.mockReset();
  authMocks.signup.mockReset();
  authMocks.verifySignupOtp.mockReset();
  authMocks.resetPassword.mockReset();
  ConsoleOtpProvider.clearTestRegistry();
  OtpProviderFactory.resetProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  OtpProviderFactory.resetProvider();
});

describe('OTP secret exposure regression', () => {
  it('delivers successfully without writing the OTP to logger output', async () => {
    sendEmail.mockResolvedValue({ data: { id: 'synthetic-email-id' }, error: null });
    const loggerSpies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
    const provider = new ResendOtpProvider();

    await provider.sendOtp({
      destination: 'synthetic-user@example.invalid',
      code: syntheticOtp,
      purpose: OtpPurposeEnum.enum.SIGNUP_VERIFICATION,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0].html).toContain(syntheticOtp);
    expect(capturedLoggerOutput(loggerSpies)).not.toContain(syntheticOtp);
  });

  it('handles provider rejection without logging echoed OTP text', async () => {
    sendEmail.mockResolvedValue({ error: { statusCode: 400, message: `rejected payload ${syntheticOtp}` } });
    const loggerSpies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
    const provider = new ResendOtpProvider();

    await expect(provider.sendOtp({
      destination: 'synthetic-user@example.invalid',
      code: syntheticOtp,
      purpose: OtpPurposeEnum.enum.PASSWORD_RESET,
    })).resolves.toBeUndefined();

    expect(capturedLoggerOutput(loggerSpies)).not.toContain(syntheticOtp);
  });

  it('handles unexpected provider exceptions without logging their message or the OTP', async () => {
    sendEmail.mockRejectedValue(new Error(`provider exception ${syntheticOtp}`));
    const loggerSpies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
    const provider = new ResendOtpProvider();

    await expect(provider.sendOtp({
      destination: 'synthetic-user@example.invalid',
      code: syntheticOtp,
      purpose: OtpPurposeEnum.enum.LOGIN_VERIFICATION,
    })).resolves.toBeUndefined();

    expect(capturedLoggerOutput(loggerSpies)).not.toContain(syntheticOtp);
  });

  it('does not print OTPs from the console development/test provider', async () => {
    const logger = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new ConsoleOtpProvider().sendOtp({
      destination: 'synthetic-user@example.invalid',
      code: syntheticOtp,
      purpose: OtpPurposeEnum.enum.SIGNUP_VERIFICATION,
    });

    expect(capturedLoggerOutput([logger])).not.toContain(syntheticOtp);
    expect(ConsoleOtpProvider.getLatestCodeForTest('synthetic-user@example.invalid')).toBe(syntheticOtp);
  });

  it('rejects malformed OTP provider payloads without logging the supplied code', async () => {
    const logger = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(new ConsoleOtpProvider().sendOtp({
      destination: 'synthetic-user@example.invalid',
      code: 'not-a-six-digit-code',
      purpose: 'NOT_A_VALID_PURPOSE' as any,
    })).rejects.toThrow(/Invalid OTP delivery payload/);

    expect(capturedLoggerOutput([logger])).toBe('');
  });

  it('cannot select the console provider in production, including by default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'console');
    OtpProviderFactory.resetProvider();
    expect(() => OtpProviderFactory.getProvider()).toThrow(/requires EMAIL_PROVIDER=resend/);

    vi.stubEnv('EMAIL_PROVIDER', '');
    vi.stubEnv('RESEND_API_KEY', '');
    OtpProviderFactory.resetProvider();
    expect(() => OtpProviderFactory.getProvider()).toThrow(/requires EMAIL_PROVIDER=resend/);
  });

  it('fails closed when production JWT secret is missing or explicit OTP pepper is invalid', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'synthetic_resend_key_for_unit_test');
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('OTP_PEPPER_SECRET', '');
    expect(() => assertAuthSecretsConfigured()).toThrow(/JWT_SECRET must be configured/);

    vi.stubEnv('JWT_SECRET', 'synthetic-jwt-secret-for-isolated-tests-0001');
    vi.stubEnv('OTP_PEPPER_SECRET', 'short-secret');
    expect(() => assertAuthSecretsConfigured()).toThrow(/OTP_PEPPER_SECRET must be configured/);

    vi.stubEnv('OTP_PEPPER_SECRET', 'synthetic-jwt-secret-for-isolated-tests-0001');
    expect(() => assertAuthSecretsConfigured()).toThrow(/must be different from JWT_SECRET/);
  });

  it('deterministically derives a secure distinct pepper when OTP_PEPPER_SECRET is omitted in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'synthetic-jwt-secret-for-isolated-tests-0001');
    vi.stubEnv('OTP_PEPPER_SECRET', '');
    expect(() => assertAuthSecretsConfigured()).not.toThrow();
    const pepper = getOtpPepperSecret();
    expect(pepper).toHaveLength(64);
    expect(pepper).not.toBe('synthetic-jwt-secret-for-isolated-tests-0001');
  });

  it('does not return an OTP included in a verification exception', async () => {
    authMocks.verifySignupOtp.mockRejectedValue(new Error(`diagnostic echo ${syntheticOtp}`));
    const response = await postJson('/verify-otp', {
      email: 'synthetic-user@example.invalid',
      code: syntheticOtp,
      purpose: OtpPurposeEnum.enum.SIGNUP_VERIFICATION,
    });

    expect(response.status).toBe(400);
    expect(response.body).not.toContain(syntheticOtp);
    expect(response.body).toContain('Unable to verify the code');
  });

  it('does not echo an OTP submitted in a malformed verification request', async () => {
    const response = await postJson('/verify-otp', { email: 'invalid', code: syntheticOtp, purpose: 'bad-purpose' });

    expect(response.status).toBe(400);
    expect(response.body).not.toContain(syntheticOtp);
    expect(authMocks.verifySignupOtp).not.toHaveBeenCalled();
  });
});

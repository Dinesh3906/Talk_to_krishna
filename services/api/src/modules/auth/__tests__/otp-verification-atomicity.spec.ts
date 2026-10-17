import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeDb, fakeOtpTable, fakeState } = vi.hoisted(() => {
  const state: any = {};
  const otpTable = {
    id: 'id',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    consumedAt: 'consumedAt',
    expiresAt: 'expiresAt',
    codeHash: 'codeHash',
    userId: 'userId',
  };
  const db = {
    query: { otpVerifications: { findFirst: vi.fn() } },
    update: vi.fn(),
  };
  return { fakeDb: db, fakeOtpTable: otpTable, fakeState: state };
});

vi.mock('../../../db/index.js', () => ({ db: fakeDb }));
vi.mock('../../../db/schema.js', () => ({ otpVerifications: fakeOtpTable }));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: any[]) => ({ conditions }),
  desc: (column: unknown) => ({ kind: 'desc', column }),
  eq: (column: unknown, value: unknown) => ({ kind: 'eq', column, value }),
  gt: (column: unknown, value: unknown) => ({ kind: 'gt', column, value }),
  gte: (column: unknown, value: unknown) => ({ kind: 'gte', column, value }),
  isNull: (column: unknown) => ({ kind: 'isNull', column }),
  lt: (column: unknown, value: unknown) => ({ kind: 'lt', column, value }),
  sql: () => 'increment_attempts',
}));

import { OtpService } from '../otp.service.js';

const knownCode = '731942';

function fulfilledCount(results: PromiseSettledResult<unknown>[]): number {
  return results.filter((result) => result.status === 'fulfilled').length;
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('JWT_SECRET', 'synthetic-jwt-secret-for-isolated-tests-0001');
  vi.stubEnv('OTP_PEPPER_SECRET', 'synthetic-otp-pepper-for-isolated-tests-0001');
  Object.assign(fakeState, {
    id: 'synthetic-otp-record',
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    userId: 'synthetic-user-id',
    codeHash: OtpService.hashOtp(knownCode),
  });

  fakeDb.query.otpVerifications.findFirst.mockImplementation(async () => fakeState.consumedAt
    ? null
    : { ...fakeState });

  fakeDb.update.mockImplementation(() => ({
    set(values: Record<string, unknown>) {
      return {
        where(condition: any) {
          let rows: Array<Record<string, unknown>> = [];
          if (values.attempts === 'increment_attempts') {
            if (!fakeState.consumedAt && fakeState.expiresAt > new Date() && fakeState.attempts < fakeState.maxAttempts) {
              fakeState.attempts += 1;
              rows = [{
                attempts: fakeState.attempts,
                maxAttempts: fakeState.maxAttempts,
                codeHash: fakeState.codeHash,
                userId: fakeState.userId,
              }];
            }
          } else if (values.verifiedAt) {
            const attemptMatch = condition.conditions.find((item: any) => item.kind === 'eq' && item.column === fakeOtpTable.attempts);
            if (!fakeState.consumedAt && attemptMatch?.value === fakeState.attempts) {
              fakeState.verifiedAt = values.verifiedAt;
              fakeState.consumedAt = values.consumedAt;
              rows = [{ userId: fakeState.userId }];
            }
          } else if (values.consumedAt && !fakeState.consumedAt) {
            fakeState.consumedAt = values.consumedAt;
          }

          const result = Promise.resolve(rows);
          return {
            then: result.then.bind(result),
            returning: () => result,
          };
        },
      };
    },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('OTP verification concurrency and attempt limits', () => {
  it('allows only one of two concurrent valid verifications to consume the code', async () => {
    const results = await Promise.allSettled([
      OtpService.verifyAndConsumeOtp('synthetic-user@example.invalid', 'SIGNUP_VERIFICATION', knownCode),
      OtpService.verifyAndConsumeOtp('synthetic-user@example.invalid', 'SIGNUP_VERIFICATION', knownCode),
    ]);

    expect(fulfilledCount(results)).toBe(1);
    expect(fakeState.consumedAt).toBeInstanceOf(Date);
    expect(results.filter((result) => result.status === 'fulfilled')[0]).toMatchObject({ status: 'fulfilled', value: { userId: 'synthetic-user-id' } });
  });

  it('locks the OTP at the configured maximum after an incorrect final attempt', async () => {
    fakeState.attempts = 4;

    await expect(OtpService.verifyAndConsumeOtp('synthetic-user@example.invalid', 'SIGNUP_VERIFICATION', '000000'))
      .rejects.toThrow(/Maximum attempts exceeded/);

    expect(fakeState.attempts).toBe(5);
    expect(fakeState.consumedAt).toBeInstanceOf(Date);
    await expect(OtpService.verifyAndConsumeOtp('synthetic-user@example.invalid', 'SIGNUP_VERIFICATION', knownCode))
      .rejects.toThrow(/No active verification code/);
  });

  it('rejects expired codes and marks them consumed', async () => {
    fakeState.expiresAt = new Date(Date.now() - 1_000);

    await expect(OtpService.verifyAndConsumeOtp('synthetic-user@example.invalid', 'SIGNUP_VERIFICATION', knownCode))
      .rejects.toThrow(/expired/);
    expect(fakeState.consumedAt).toBeInstanceOf(Date);
  });
});

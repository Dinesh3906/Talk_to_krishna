import { describe, expect, it } from 'vitest';
import { isCorsOriginAllowed, parseAllowedOrigins, safeErrorLogMetadata, safeErrorResponse, sanitizeRequestId } from '../http-security.js';

describe('HTTP security policies', () => {
  it('allows only configured browser origins in production with credentials', () => {
    const allowed = parseAllowedOrigins('https://app.example.invalid, https://admin.example.invalid ');

    expect(isCorsOriginAllowed('https://app.example.invalid', allowed, 'production')).toBe(true);
    expect(isCorsOriginAllowed('https://attacker.example.invalid', allowed, 'production')).toBe(false);
    expect(isCorsOriginAllowed('http://localhost:8081', allowed, 'production')).toBe(false);
    expect(isCorsOriginAllowed(undefined, allowed, 'production')).toBe(true);
  });

  it('allows loopback browser origins only outside production', () => {
    const allowed = new Set<string>();

    expect(isCorsOriginAllowed('http://localhost:19006', allowed, 'development')).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:3000', allowed, 'test')).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:19006', allowed, 'production')).toBe(false);
    expect(isCorsOriginAllowed('https://localhost.attacker.invalid', allowed, 'development')).toBe(false);
  });

  it('replaces malformed correlation IDs and never includes exception messages or request bodies in diagnostics', () => {
    const otp = '731942';
    const requestId = sanitizeRequestId(`bad\r\n${otp}`, 'synthetic-safe-id');
    const error = Object.assign(new Error(`parse failure: ${otp}`), {
      status: 400,
      code: `OTP_${otp}`,
      body: { code: otp },
      name: `Error ${otp}`,
    });

    const logFields = JSON.stringify(safeErrorLogMetadata(error, requestId));
    const response = JSON.stringify(safeErrorResponse(error, requestId));

    expect(requestId).toBe('synthetic-safe-id');
    expect(logFields).not.toContain(otp);
    expect(response).not.toContain(otp);
    expect(logFields).not.toContain('parse failure');
    expect(response).toContain('An unexpected internal error occurred.');
  });
});

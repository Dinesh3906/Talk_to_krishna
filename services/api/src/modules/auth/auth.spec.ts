import { describe, it, expect } from 'vitest';
import { GoogleAuthSchema } from '@talk-to-krisna/shared';
import { AuthService } from './auth.service.js';

describe('Google Authentication', () => {
  it('validates GoogleAuthSchema correctly', () => {
    const valid = GoogleAuthSchema.safeParse({ idToken: 'valid_mock_token_string' });
    expect(valid.success).toBe(true);

    const empty = GoogleAuthSchema.safeParse({ idToken: '' });
    expect(empty.success).toBe(false);

    const missing = GoogleAuthSchema.safeParse({});
    expect(missing.success).toBe(false);
  });

  it('rejects invalid or malformed Google ID tokens with descriptive error', async () => {
    await expect(
      AuthService.googleLogin('invalid_token_xyz')
    ).rejects.toThrow(/Google token verification failed/);
  });
});

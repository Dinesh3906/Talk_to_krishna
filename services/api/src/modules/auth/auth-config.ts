import crypto from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

function requireSecret(name: string, value: string | undefined): string {
  if (!value || value.length < MIN_SECRET_LENGTH || value.toLowerCase().includes('change_in_production')) {
    throw new Error(`${name} must be configured with at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return value;
}

export function getJwtSecret(): string {
  return requireSecret('JWT_SECRET', process.env.JWT_SECRET);
}

export function getOtpPepperSecret(): string {
  const explicit = process.env.OTP_PEPPER_SECRET?.trim();
  if (explicit) {
    return requireSecret('OTP_PEPPER_SECRET', explicit);
  }
  // When OTP_PEPPER_SECRET is not explicitly passed in environment variables,
  // derive a deterministic, cryptographically secure 64-char HMAC pepper from JWT_SECRET.
  // This satisfies the >= 32 chars requirement and ensures otpPepper !== jwtSecret.
  const jwtSecret = getJwtSecret();
  return crypto.createHmac('sha256', jwtSecret).update('talk-to-krishna-otp-pepper-salt-v1').digest('hex');
}

export function assertAuthSecretsConfigured(): void {
  const jwtSecret = getJwtSecret();
  const otpPepper = getOtpPepperSecret();

  if (process.env.NODE_ENV === 'production') {
    if (otpPepper === jwtSecret) {
      throw new Error('OTP_PEPPER_SECRET must be different from JWT_SECRET in production.');
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (process.env.EMAIL_PROVIDER === 'resend' && (!apiKey || apiKey === 're_123')) {
      console.warn('[Talk to Krishna API] Warning: RESEND_API_KEY is not configured. Email OTP delivery will be disabled, but Sanctuary AI remains operational.');
    }
  }
}

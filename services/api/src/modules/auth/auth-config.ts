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
  const value = process.env.OTP_PEPPER_SECRET || (process.env.NODE_ENV === 'production' ? undefined : process.env.JWT_SECRET);
  return requireSecret('OTP_PEPPER_SECRET', value);
}

export function assertAuthSecretsConfigured(): void {
  const jwtSecret = getJwtSecret();
  const otpPepper = getOtpPepperSecret();

  if (process.env.NODE_ENV === 'production') {
    if (otpPepper === jwtSecret) {
      throw new Error('OTP_PEPPER_SECRET must be different from JWT_SECRET in production.');
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (process.env.EMAIL_PROVIDER !== 'resend' || !apiKey || apiKey === 're_123') {
      throw new Error('Production authentication requires EMAIL_PROVIDER=resend and a configured RESEND_API_KEY.');
    }
  }
}

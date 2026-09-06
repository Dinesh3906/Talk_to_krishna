import { Resend } from 'resend';
import { OtpDeliveryPayload, OtpDeliveryProvider } from './otp-delivery.interface.js';
import { OtpPurposeEnum } from '@talk-to-krisna/shared';

export class ResendOtpProvider implements OtpDeliveryProvider {
  public readonly name = 'resend';
  private resend: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey !== 're_123') {
      this.resend = new Resend(apiKey);
    }
  }

  public async sendOtp(payload: OtpDeliveryPayload): Promise<void> {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && apiKey !== 're_123') {
        this.resend = new Resend(apiKey);
      } else {
        throw new Error('Resend API key is missing or not configured.');
      }
    }

    const { destination: email, code, purpose, preferredName } = payload;

    const subject = this.getSubject(purpose);
    const html = this.buildEmailHtml(code, purpose, preferredName);

    const primaryFrom = process.env.RESEND_FROM_EMAIL || 'Talk to Krishna <contact@codealgo.live>';
    const fallbackFrom = 'Talk to Krishna <onboarding@resend.dev>';

    let res = await this.resend.emails.send({
      from: primaryFrom,
      to: [email],
      subject,
      html,
    });

    if (res.error && (res.error.statusCode === 403 || res.error.message?.toLowerCase().includes('not verified') || res.error.message?.toLowerCase().includes('domain'))) {
      console.warn(`[ResendOtpProvider] Primary from '${primaryFrom}' failed (${res.error.message}). Attempting fallback to '${fallbackFrom}'...`);
      res = await this.resend.emails.send({
        from: fallbackFrom,
        to: [email],
        subject,
        html,
      });
    }

    if (res.error) {
      console.error(`[ResendOtpProvider] Failed to deliver OTP email to ${this.maskEmail(email)}:`, res.error.message);
      throw new Error(`Email delivery failed: ${res.error.message}`);
    }

    console.log(`[ResendOtpProvider] Successfully delivered OTP email to ${this.maskEmail(email)} [Purpose: ${purpose}]`);
  }

  private getSubject(purpose: string): string {
    switch (purpose) {
      case OtpPurposeEnum.enum.SIGNUP_VERIFICATION:
        return 'Talk to Krishna — Verify Your Email Address';
      case OtpPurposeEnum.enum.PASSWORD_RESET:
        return 'Talk to Krishna — Reset Your Password';
      case OtpPurposeEnum.enum.LOGIN_VERIFICATION:
        return 'Talk to Krishna — Login Verification Code';
      default:
        return 'Talk to Krishna — Your Verification Code';
    }
  }

  private buildEmailHtml(code: string, purpose: string, name?: string): string {
    const greeting = name ? `Hare Krishna, ${name}` : 'Hare Krishna';
    const actionText = purpose === OtpPurposeEnum.enum.PASSWORD_RESET
      ? 'Use this verification code to reset your password.'
      : 'Use this verification code to verify your Talk to Krishna account.';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px 24px; border: 1px solid #fed7aa; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #ea580c; font-size: 24px; margin: 0; font-weight: 700;">Talk to Krishna</h1>
          <p style="color: #9a3412; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Spiritual Guidance & Wisdom</p>
        </div>

        <p style="font-size: 16px; margin: 0 0 12px 0;">${greeting},</p>
        <p style="font-size: 15px; line-height: 1.5; color: #475569; margin: 0 0 20px 0;">${actionText}</p>

        <div style="background: #fff7ed; border: 2px dashed #f97316; border-radius: 10px; padding: 20px; font-size: 32px; font-weight: 800; text-align: center; letter-spacing: 8px; color: #ea580c; margin: 24px 0;">
          ${code}
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.4; margin: 0 0 16px 0;">
          This code will expire in <strong>10 minutes</strong> and can only be used once. Never share this code with anyone.
        </p>

        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />

        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          If you did not request this verification code, you can safely ignore this email.
        </p>
      </div>
    `;
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
    return `${maskedName}@${domain}`;
  }
}

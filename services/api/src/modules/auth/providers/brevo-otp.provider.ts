import { assertValidOtpDeliveryPayload, OtpDeliveryPayload, OtpDeliveryProvider } from './otp-delivery.interface.js';
import { OtpPurposeEnum } from '@talk-to-krisna/shared';

export class BrevoOtpProvider implements OtpDeliveryProvider {
  public readonly name = 'brevo';
  private apiKey: string;
  private senderEmail: string;
  private senderName: string;

  constructor(customApiKey?: string, customSenderEmail?: string, customSenderName?: string) {
    this.apiKey = customApiKey || process.env.BREVO_API_KEY || '';
    this.senderEmail =
      customSenderEmail ||
      process.env.BREVO_SENDER_EMAIL ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      'ajay390620@gmail.com';
    this.senderName = customSenderName || process.env.BREVO_SENDER_NAME || 'Talk to Krishna';
  }

  public async sendOtp(payload: OtpDeliveryPayload): Promise<void> {
    assertValidOtpDeliveryPayload(payload);

    const apiKey = this.apiKey || process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error('Brevo API key is not configured. Set BREVO_API_KEY environment variable.');
    }

    const { destination: email, code, purpose, preferredName } = payload;
    const subject = this.getSubject(purpose);
    const htmlContent = this.buildEmailHtml(code, purpose, preferredName);
    const textContent = this.buildEmailText(code, purpose, preferredName);

    const bodyData = {
      sender: {
        name: this.senderName,
        email: this.senderEmail,
      },
      to: [
        {
          email,
          name: preferredName || 'Seeker',
        },
      ],
      subject,
      htmlContent,
      textContent,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(bodyData),
      signal: AbortSignal.timeout(6000), // 6s timeout
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('[BrevoOtpProvider] Email delivery rejected:', {
        status: response.status,
        statusText: response.statusText,
        error: errBody,
      });
      throw new Error(`Brevo HTTP delivery failed (${response.status}): ${errBody || response.statusText}`);
    }

    const data: any = await response.json().catch(() => ({}));
    console.log('[BrevoOtpProvider] Email delivered successfully over HTTPS (Port 443).', {
      provider: this.name,
      operation: 'send_otp',
      messageId: data.messageId,
    });
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

  private buildEmailText(code: string, purpose: string, name?: string): string {
    const greeting = name ? `Hare Krishna, ${name}` : 'Hare Krishna';
    const action =
      purpose === OtpPurposeEnum.enum.PASSWORD_RESET
        ? 'use the following code to reset your password'
        : 'use the following code to verify your Talk to Krishna account';
    return `${greeting},\n\nPlease ${action}:\n\n  ${code}\n\nThis verification code will expire in 10 minutes. If you did not request this code, you can safely ignore this email.\n\nWarm regards,\nTalk to Krishna Team`;
  }

  private buildEmailHtml(code: string, purpose: string, name?: string): string {
    const greeting = name ? `Hare Krishna, ${this.escapeHtml(name)}` : 'Hare Krishna';
    const escapedCode = this.escapeHtml(code);
    const actionText =
      purpose === OtpPurposeEnum.enum.PASSWORD_RESET
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
          ${escapedCode}
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

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!);
  }
}

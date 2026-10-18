import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { assertValidOtpDeliveryPayload, OtpDeliveryPayload, OtpDeliveryProvider } from './otp-delivery.interface.js';
import { OtpPurposeEnum } from '@talk-to-krisna/shared';

export interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user: string;
  pass: string;
  from?: string;
  service?: string;
}

export class SmtpOtpProvider implements OtpDeliveryProvider {
  public readonly name = 'smtp';
  private transporter: Transporter | null = null;
  private fromAddress: string;

  constructor(customConfig?: Partial<SmtpConfig>) {
    const user = customConfig?.user || process.env.SMTP_USER || process.env.GMAIL_USER || '';
    const pass = customConfig?.pass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '';
    const host = customConfig?.host || process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const port = customConfig?.port || (portStr ? parseInt(portStr, 10) : undefined);
    const secure = customConfig?.secure !== undefined
      ? customConfig.secure
      : process.env.SMTP_SECURE === 'true' || port === 465;
    const service = customConfig?.service || process.env.SMTP_SERVICE || (user.endsWith('@gmail.com') ? 'gmail' : undefined);

    this.fromAddress =
      customConfig?.from ||
      process.env.SMTP_FROM ||
      (user ? `Talk to Krishna <${user}>` : 'Talk to Krishna <no-reply@talktokrishna.app>');

    if (user && pass) {
      if (service === 'gmail' && !host) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        });
      } else {
        this.transporter = nodemailer.createTransport({
          host: host || 'smtp.gmail.com',
          port: port || (secure ? 465 : 587),
          secure,
          auth: { user, pass },
          connectionTimeout: 8000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        });
      }
    }
  }

  public async sendOtp(payload: OtpDeliveryPayload): Promise<void> {
    assertValidOtpDeliveryPayload(payload);

    if (!this.transporter) {
      const user = process.env.SMTP_USER || process.env.GMAIL_USER;
      const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
      if (!user || !pass) {
        console.error('[SmtpOtpProvider] SMTP credentials (SMTP_USER/GMAIL_USER and SMTP_PASS/GMAIL_APP_PASSWORD) are not configured.');
        throw new Error('SMTP email delivery is not configured. Missing SMTP_USER or SMTP_PASS.');
      }
      this.reinitializeTransporter(user, pass);
    }

    const { destination: email, code, purpose, preferredName } = payload;
    const subject = this.getSubject(purpose);
    const html = this.buildEmailHtml(code, purpose, preferredName);
    const text = this.buildEmailText(code, purpose, preferredName);

    try {
      const info = await this.transporter!.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });

      console.log('[SmtpOtpProvider] Email delivered.', {
        provider: this.name,
        operation: 'send_otp',
        outcome: 'success',
        messageId: info.messageId,
      });
    } catch (err: any) {
      console.error('[SmtpOtpProvider] Email delivery failed.', {
        provider: this.name,
        operation: 'send_otp',
        outcome: 'error',
        error: err?.message ? String(err.message).replace(/\d{6}/g, '******') : 'Unknown error',
      });
      throw new Error(`Failed to deliver verification code via SMTP: ${err?.message || 'Delivery error'}`);
    }
  }

  private reinitializeTransporter(user: string, pass: string): void {
    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const port = portStr ? parseInt(portStr, 10) : undefined;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const service = process.env.SMTP_SERVICE || (user.endsWith('@gmail.com') ? 'gmail' : undefined);

    if (service === 'gmail' && !host) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port: port || (secure ? 465 : 587),
        secure,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });
    }
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
    const action = purpose === OtpPurposeEnum.enum.PASSWORD_RESET
      ? 'use the following code to reset your password'
      : 'use the following code to verify your Talk to Krishna account';
    return `${greeting},\n\nPlease ${action}:\n\n  ${code}\n\nThis verification code will expire in 10 minutes. If you did not request this code, you can safely ignore this email.\n\nWarm regards,\nTalk to Krishna Team`;
  }

  private buildEmailHtml(code: string, purpose: string, name?: string): string {
    const greeting = name ? `Hare Krishna, ${this.escapeHtml(name)}` : 'Hare Krishna';
    const escapedCode = this.escapeHtml(code);
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
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!);
  }
}

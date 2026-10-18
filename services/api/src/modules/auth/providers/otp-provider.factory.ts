import { OtpDeliveryProvider } from './otp-delivery.interface.js';
import { ConsoleOtpProvider } from './console-otp.provider.js';
import { ResendOtpProvider } from './resend-otp.provider.js';
import { SmtpOtpProvider } from './smtp-otp.provider.js';
import { BrevoOtpProvider } from './brevo-otp.provider.js';

export class OtpProviderFactory {
  private static instance: OtpDeliveryProvider | null = null;

  public static getProvider(): OtpDeliveryProvider {
    if (this.instance) {
      return this.instance;
    }

    const configuredProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const hasBrevoConfig = !!(process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim().length > 5);
    const hasSmtpConfig = !!(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.SMTP_HOST);
    const hasResendConfig = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123');

    // If Brevo is configured, prioritize it over SMTP because SMTP ports (465/587) are firewalled on Render Free tier
    const providerType =
      hasBrevoConfig && (!configuredProvider || configuredProvider === 'brevo' || configuredProvider === 'smtp')
        ? 'brevo'
        : configuredProvider ||
          (hasBrevoConfig ? 'brevo' : hasSmtpConfig ? 'smtp' : hasResendConfig ? 'resend' : 'console');

    if (
      process.env.NODE_ENV === 'production' &&
      providerType !== 'brevo' &&
      providerType !== 'resend' &&
      providerType !== 'smtp'
    ) {
      throw new Error('Production authentication requires EMAIL_PROVIDER=brevo, EMAIL_PROVIDER=smtp, or EMAIL_PROVIDER=resend.');
    }

    if (providerType !== 'brevo' && providerType !== 'resend' && providerType !== 'smtp' && providerType !== 'console') {
      throw new Error(`Unsupported EMAIL_PROVIDER: ${providerType}`);
    }

    switch (providerType) {
      case 'brevo':
        this.instance = new BrevoOtpProvider();
        return this.instance;
      case 'smtp':
        this.instance = new SmtpOtpProvider();
        return this.instance;
      case 'resend':
        this.instance = new ResendOtpProvider();
        return this.instance;
      case 'console':
        this.instance = new ConsoleOtpProvider();
        return this.instance;
      default:
        throw new Error(`Unsupported EMAIL_PROVIDER: ${providerType}`);
    }
  }

  public static getSecondaryProvider(): OtpDeliveryProvider | null {
    const primary = this.getProvider();
    if (primary.name !== 'brevo' && process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim().length > 5) {
      return new BrevoOtpProvider();
    }
    if (primary.name !== 'smtp' && !!(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.SMTP_HOST)) {
      return new SmtpOtpProvider();
    }
    if (primary.name !== 'resend' && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123') {
      return new ResendOtpProvider();
    }
    return null;
  }

  public static setProviderForTesting(provider: OtpDeliveryProvider): void {
    this.instance = provider;
  }

  public static resetProvider(): void {
    this.instance = null;
  }
}

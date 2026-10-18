import { OtpDeliveryProvider } from './otp-delivery.interface.js';
import { ConsoleOtpProvider } from './console-otp.provider.js';
import { ResendOtpProvider } from './resend-otp.provider.js';
import { SmtpOtpProvider } from './smtp-otp.provider.js';

export class OtpProviderFactory {
  private static instance: OtpDeliveryProvider | null = null;

  public static getProvider(): OtpDeliveryProvider {
    if (this.instance) {
      return this.instance;
    }

    const configuredProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const hasSmtpConfig = !!(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.SMTP_HOST);
    const hasResendConfig = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123');

    const providerType =
      configuredProvider ||
      (hasSmtpConfig ? 'smtp' : hasResendConfig ? 'resend' : 'console');

    if (process.env.NODE_ENV === 'production' && providerType !== 'resend' && providerType !== 'smtp') {
      throw new Error('Production authentication requires EMAIL_PROVIDER=smtp or EMAIL_PROVIDER=resend.');
    }

    if (providerType !== 'resend' && providerType !== 'smtp' && providerType !== 'console') {
      throw new Error(`Unsupported EMAIL_PROVIDER: ${providerType}`);
    }

    switch (providerType) {
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
    if (primary.name === 'smtp' && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123') {
      return new ResendOtpProvider();
    }
    if (primary.name === 'resend' && !!(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.SMTP_HOST)) {
      return new SmtpOtpProvider();
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

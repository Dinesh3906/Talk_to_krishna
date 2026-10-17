import { OtpDeliveryProvider } from './otp-delivery.interface.js';
import { ConsoleOtpProvider } from './console-otp.provider.js';
import { ResendOtpProvider } from './resend-otp.provider.js';

export class OtpProviderFactory {
  private static instance: OtpDeliveryProvider | null = null;

  public static getProvider(): OtpDeliveryProvider {
    if (this.instance) {
      return this.instance;
    }

    const configuredProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const providerType = configuredProvider || (process.env.RESEND_API_KEY ? 'resend' : 'console');

    if (process.env.NODE_ENV === 'production' && providerType !== 'resend') {
      throw new Error('Production authentication requires EMAIL_PROVIDER=resend.');
    }

    if (providerType !== 'resend' && providerType !== 'console') {
      throw new Error(`Unsupported EMAIL_PROVIDER: ${providerType}`);
    }

    switch (providerType) {
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

  public static setProviderForTesting(provider: OtpDeliveryProvider): void {
    this.instance = provider;
  }

  public static resetProvider(): void {
    this.instance = null;
  }
}

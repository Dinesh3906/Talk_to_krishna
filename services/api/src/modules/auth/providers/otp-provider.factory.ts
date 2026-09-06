import { OtpDeliveryProvider } from './otp-delivery.interface.js';
import { ConsoleOtpProvider } from './console-otp.provider.js';
import { ResendOtpProvider } from './resend-otp.provider.js';

export class OtpProviderFactory {
  private static instance: OtpDeliveryProvider | null = null;

  public static getProvider(): OtpDeliveryProvider {
    if (this.instance) {
      return this.instance;
    }

    const providerType = (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'console')).toLowerCase();

    switch (providerType) {
      case 'resend':
        this.instance = new ResendOtpProvider();
        return this.instance;
      case 'console':
      default:
        this.instance = new ConsoleOtpProvider();
        return this.instance;
    }
  }

  public static setProviderForTesting(provider: OtpDeliveryProvider): void {
    this.instance = provider;
  }

  public static resetProvider(): void {
    this.instance = null;
  }
}

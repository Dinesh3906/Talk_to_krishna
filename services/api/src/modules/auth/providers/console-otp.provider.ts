import { assertValidOtpDeliveryPayload, OtpDeliveryProvider, OtpDeliveryPayload } from './otp-delivery.interface.js';

export class ConsoleOtpProvider implements OtpDeliveryProvider {
  public readonly name = 'console';
  
  // Test hook: keeps track of the latest dispatched OTPs in memory for automated integration testing
  private static testDispatchedOtps = new Map<string, string>();

  public async sendOtp(payload: OtpDeliveryPayload): Promise<void> {
    assertValidOtpDeliveryPayload(payload);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('The console OTP provider is disabled in production.');
    }

    if (process.env.NODE_ENV === 'test') {
      ConsoleOtpProvider.testDispatchedOtps.set(payload.destination.toLowerCase(), payload.code);
    }

    console.log('[OTP Dispatch] Verification code dispatched.', {
      provider: this.name,
      operation: 'send_otp',
      purpose: payload.purpose,
      outcome: 'success',
    });
  }

  public static getLatestCodeForTest(destination: string): string | undefined {
    return ConsoleOtpProvider.testDispatchedOtps.get(destination.toLowerCase());
  }

  public static clearTestRegistry(): void {
    ConsoleOtpProvider.testDispatchedOtps.clear();
  }

}

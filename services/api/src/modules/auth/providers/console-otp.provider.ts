import { OtpDeliveryProvider, OtpDeliveryPayload } from './otp-delivery.interface.js';

export class ConsoleOtpProvider implements OtpDeliveryProvider {
  public readonly name = 'console';
  
  // Test hook: keeps track of the latest dispatched OTPs in memory for automated integration testing
  private static testDispatchedOtps = new Map<string, string>();

  public async sendOtp(payload: OtpDeliveryPayload): Promise<void> {
    const maskedDest = this.maskDestination(payload.destination);

    // Save in test registry for unit/integration verification
    ConsoleOtpProvider.testDispatchedOtps.set(payload.destination.toLowerCase(), payload.code);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP Dispatch] [${payload.purpose}] Code sent to ${maskedDest} (code: ${payload.code})`);
    } else {
      console.log(`[OTP Dispatch] [${payload.purpose}] Verification code sent to ${maskedDest}`);
    }
  }

  public static getLatestCodeForTest(destination: string): string | undefined {
    return ConsoleOtpProvider.testDispatchedOtps.get(destination.toLowerCase());
  }

  public static clearTestRegistry(): void {
    ConsoleOtpProvider.testDispatchedOtps.clear();
  }

  private maskDestination(destination: string): string {
    if (destination.includes('@')) {
      const [name, domain] = destination.split('@');
      const visible = name.slice(0, 2);
      return `${visible}***@${domain}`;
    }
    return `${destination.slice(0, 3)}***${destination.slice(-2)}`;
  }
}

import { OtpPurpose } from '@talk-to-krisna/shared';

export interface OtpDeliveryPayload {
  destination: string; // email address or phone number
  code: string;        // plaintext code exists only in memory for dispatch
  purpose: OtpPurpose;
  preferredName?: string;
}

export interface OtpDeliveryProvider {
  name: string;
  sendOtp(payload: OtpDeliveryPayload): Promise<void>;
}

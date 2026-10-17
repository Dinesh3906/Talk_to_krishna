import { OtpPurpose, OtpPurposeEnum } from '@talk-to-krisna/shared';

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

export function assertValidOtpDeliveryPayload(payload: OtpDeliveryPayload): void {
  const allowedPurposes = Object.values(OtpPurposeEnum.enum) as string[];
  if (
    !payload ||
    typeof payload.destination !== 'string' ||
    payload.destination.trim().length === 0 ||
    payload.destination.length > 320 ||
    typeof payload.code !== 'string' ||
    !/^\d{6}$/.test(payload.code) ||
    !allowedPurposes.includes(payload.purpose)
  ) {
    throw new Error('Invalid OTP delivery payload.');
  }
}

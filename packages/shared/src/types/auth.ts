import { z } from 'zod';
import { User, UserPreferences } from './user.js';

export const OtpPurposeEnum = z.enum([
  'SIGNUP_VERIFICATION',
  'PASSWORD_RESET',
  'LOGIN_VERIFICATION',
  'CHANGE_EMAIL',
  'CHANGE_PHONE',
]);

export type OtpPurpose = z.infer<typeof OtpPurposeEnum>;

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  displayName: z.string().min(1).max(100).optional(),
  preferredName: z.string().min(1).max(50).optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

export const SignupSchema = RegisterSchema;
export type SignupDto = RegisterDto;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const AnonymousAuthSchema = z.object({
  preferredName: z.string().min(1).max(50).optional(),
});

export type AnonymousAuthDto = z.infer<typeof AnonymousAuthSchema>;

export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

export type GoogleAuthDto = z.infer<typeof GoogleAuthSchema>;

export const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Verification code must be exactly 6 digits'),
  purpose: OtpPurposeEnum,
});

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Verification code must be exactly 6 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const ResendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  purpose: OtpPurposeEnum,
});

export type ResendOtpDto = z.infer<typeof ResendOtpSchema>;

export interface AuthSession {
  user: User;
  profile?: UserPreferences;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface AuthTokenPayload {
  sub: string;
  email?: string;
  isAnonymous: boolean;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

import { z } from 'zod';
import { User, UserPreferences } from './user.js';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  displayName: z.string().min(1).max(100).optional(),
  preferredName: z.string().min(1).max(50).optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const AnonymousAuthSchema = z.object({
  preferredName: z.string().min(1).max(50).optional(),
});

export type AnonymousAuthDto = z.infer<typeof AnonymousAuthSchema>;

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
  iat?: number;
  exp?: number;
}

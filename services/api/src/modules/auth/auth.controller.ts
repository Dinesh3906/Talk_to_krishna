import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { authMiddleware } from './auth.middleware.js';
import {
  RegisterSchema,
  SignupSchema,
  LoginSchema,
  AnonymousAuthSchema,
  GoogleAuthSchema,
  VerifyOtpSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ResendOtpSchema,
} from '@talk-to-krisna/shared';
import { db } from '../../db/index.js';
import { userProfiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

function safeOtpFailureMessage(error: any): string {
  const message = typeof error?.message === 'string' ? error.message : '';
  const knownMessages = new Set([
    'No active verification code found or code has already been used.',
    'Verification code has expired. Please request a new one.',
    'Maximum verification attempts exceeded. Code has been locked.',
    'Incorrect verification code. Maximum attempts exceeded. Please request a new code.',
  ]);
  if (knownMessages.has(message) || /^Incorrect verification code\. \d+ attempt\(s\) remaining\.$/.test(message)) {
    return message;
  }
  return 'Unable to verify the code. Please request a new one and try again.';
}

// 1. Production Signup (Creates unverified user and dispatches OTP)
router.post('/signup', async (req: Request, res: Response) => {
  const parseResult = SignupSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
        details: parseResult.error.errors,
      },
    });
  }

  try {
    const result = await AuthService.signup(parseResult.data);
    return res.status(201).json({ data: result });
  } catch (err: any) {
    const message = err?.message === 'An account with this email address already exists.'
      ? err.message
      : 'Could not create the account. Please try again.';
    return res.status(400).json({
      error: {
        code: 'SIGNUP_FAILED',
        message,
      },
    });
  }
});

// 2. Verify OTP (Activates account and returns authenticated session)
router.post('/verify-otp', async (req: Request, res: Response) => {
  const parseResult = VerifyOtpSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid verification request',
        details: parseResult.error.errors,
      },
    });
  }

  try {
    const session = await AuthService.verifySignupOtp(parseResult.data);
    return res.status(200).json({ data: session });
  } catch (err: any) {
    return res.status(400).json({
      error: {
        code: 'OTP_VERIFICATION_FAILED',
        message: safeOtpFailureMessage(err),
      },
    });
  }
});

// 3. Login with Email & Password
router.post('/login', async (req: Request, res: Response) => {
  const parseResult = LoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid email or password',
      },
    });
  }

  try {
    const session = await AuthService.login(parseResult.data);
    return res.status(200).json({ data: session });
  } catch (err: any) {
    const isUnverified = typeof err?.message === 'string' && err.message.startsWith('ACCOUNT_NOT_VERIFIED:');
    const isInvalidCredentials = err?.message === 'Invalid email or password.';
    return res.status(isUnverified ? 403 : 401).json({
      error: {
        code: isUnverified ? 'ACCOUNT_NOT_VERIFIED' : 'AUTHENTICATION_FAILED',
        message: isUnverified
          ? 'Your account is not verified. A verification code has been sent to your email.'
          : isInvalidCredentials
            ? 'Invalid email or password.'
            : 'Unable to sign in. Please try again.',
      },
    });
  }
});

// 4. Forgot Password (Dispatches reset OTP; generic response prevents account enumeration)
router.post('/forgot-password', async (req: Request, res: Response) => {
  const parseResult = ForgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid email address',
      },
    });
  }

  try {
    const result = await AuthService.forgotPassword(parseResult.data);
    return res.status(200).json({ data: result });
  } catch (err: any) {
    const cooldownMessage = typeof err?.message === 'string' && /^Please wait \d+ seconds before requesting another code\.$/.test(err.message)
      ? err.message
      : undefined;
    return res.status(cooldownMessage ? 400 : 500).json({
      error: {
        code: 'FORGOT_PASSWORD_FAILED',
        message: cooldownMessage || 'Could not process the password reset request. Please try again.',
      },
    });
  }
});

// 5. Reset Password (Verifies OTP and revokes active sessions)
router.post('/reset-password', async (req: Request, res: Response) => {
  const parseResult = ResetPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid password reset request',
        details: parseResult.error.errors,
      },
    });
  }

  try {
    const result = await AuthService.resetPassword(parseResult.data);
    return res.status(200).json({ data: result });
  } catch (err: any) {
    return res.status(400).json({
      error: {
        code: 'PASSWORD_RESET_FAILED',
        message: safeOtpFailureMessage(err),
      },
    });
  }
});

// 6. Resend OTP
router.post('/resend-otp', async (req: Request, res: Response) => {
  const parseResult = ResendOtpSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid resend request',
      },
    });
  }

  try {
    const result = await AuthService.resendOtp(parseResult.data);
    return res.status(200).json({ data: result });
  } catch (err: any) {
    const cooldownMessage = typeof err?.message === 'string' && /^Please wait \d+ seconds before requesting another code\.$/.test(err.message)
      ? err.message
      : undefined;
    return res.status(400).json({
      error: {
        code: 'RESEND_OTP_FAILED',
        message: cooldownMessage || 'Could not send a verification code. Please try again.',
      },
    });
  }
});

// 7. Google Authentication
router.post('/google', async (req: Request, res: Response) => {
  const parseResult = GoogleAuthSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid Google ID token',
        details: parseResult.error.errors,
      },
    });
  }

  try {
    const session = await AuthService.googleLogin(parseResult.data.idToken);
    return res.status(200).json({ data: session });
  } catch (err: any) {
    return res.status(401).json({
      error: {
        code: 'GOOGLE_AUTH_FAILED',
        message: 'Google authentication failed. Please try again.',
      },
    });
  }
});

// 8. Create Real Anonymous Account
router.post('/anonymous', async (req: Request, res: Response) => {
  const parseResult = AnonymousAuthSchema.safeParse(req.body);
  const data = parseResult.success ? parseResult.data : undefined;

  try {
    const session = await AuthService.createAnonymousSession(data);
    return res.status(201).json({ data: session });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'ANONYMOUS_AUTH_FAILED',
        message: 'Could not create an anonymous session. Please try again.',
      },
    });
  }
});

// 9. Legacy /register endpoint (backward compatibility)
router.post('/register', async (req: Request, res: Response) => {
  const parseResult = RegisterSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
      },
    });
  }

  try {
    const session = await AuthService.register(parseResult.data);
    return res.status(201).json({ data: session });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Could not register the account. Please try again.',
      },
    });
  }
});

// 10. Get Current User Profile (Protected)
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  try {
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, user.id),
    });

    return res.status(200).json({
      data: {
        user,
        profile: profile
          ? {
              userId: profile.userId,
              reflectionDepth: profile.reflectionDepth,
              mahabharataDensity: profile.mahabharataDensity,
              themePreference: profile.themePreference,
              enableLongTermMemory: profile.enableLongTermMemory,
              preferredLanguage: profile.preferredLanguage,
            }
          : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: 'Could not load the user profile. Please try again.',
      },
    });
  }
});

export default router;

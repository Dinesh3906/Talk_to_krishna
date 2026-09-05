import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { authMiddleware } from './auth.middleware.js';
import { RegisterSchema, LoginSchema, AnonymousAuthSchema } from '@talk-to-krisna/shared';
import { db } from '../../db/index.js';
import { userProfiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Register with Email
router.post('/register', async (req: Request, res: Response) => {
  const parseResult = RegisterSchema.safeParse(req.body);
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
    const session = await AuthService.register(parseResult.data);
    return res.status(201).json({ data: session });
  } catch (err: any) {
    return res.status(400).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: err.message,
      },
    });
  }
});

// Login with Email
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
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: err.message,
      },
    });
  }
});

// Create Real Anonymous Account
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
        message: err.message,
      },
    });
  }
});

// Get Current User Profile (Protected)
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
        message: err.message,
      },
    });
  }
});

export default router;

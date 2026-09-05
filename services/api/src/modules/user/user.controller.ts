import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { UpdatePreferencesSchema } from '@talk-to-krisna/shared';
import { db } from '../../db/index.js';
import { users, userProfiles, userMemories } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

router.use(authMiddleware);

// Update Preferences & Preferred Name
router.patch('/preferences', async (req: Request, res: Response) => {
  const parseResult = UpdatePreferencesSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
      },
    });
  }

  const userId = req.user!.id;
  const data = parseResult.data;

  try {
    if (data.preferredName) {
      await db.update(users).set({ preferredName: data.preferredName }).where(eq(users.id, userId));
    }

    const [updatedProfile] = await db
      .update(userProfiles)
      .set({
        ...(data.reflectionDepth ? { reflectionDepth: data.reflectionDepth } : {}),
        ...(data.mahabharataDensity ? { mahabharataDensity: data.mahabharataDensity } : {}),
        ...(data.themePreference ? { themePreference: data.themePreference } : {}),
        ...(data.enableLongTermMemory !== undefined ? { enableLongTermMemory: data.enableLongTermMemory } : {}),
        ...(data.preferredLanguage ? { preferredLanguage: data.preferredLanguage } : {}),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    return res.status(200).json({ data: updatedProfile });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'PREFERENCES_UPDATE_FAILED',
        message: err.message,
      },
    });
  }
});

// Delete Stored Memory Item
router.delete('/memory/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const memoryId = req.params.id as string;

  try {
    await db
      .delete(userMemories)
      .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, userId)));

    return res.status(200).json({ success: true, message: 'Memory removed.' });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'MEMORY_DELETION_FAILED',
        message: err.message,
      },
    });
  }
});

// Delete Entire Account (Right to be Forgotten)
router.delete('/account', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    await db.delete(users).where(eq(users.id, userId));
    return res.status(200).json({ success: true, message: 'Account and all associated data permanently deleted.' });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'ACCOUNT_DELETION_FAILED',
        message: err.message,
      },
    });
  }
});

export default router;

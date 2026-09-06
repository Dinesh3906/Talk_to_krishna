import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, userProfiles } from '../../db/schema.js';

async function seedReviewer() {
  const email = 'play-review@talktokrishna.ai';
  const password = 'KrishnaReview2026!';
  const displayName = 'Google Play Reviewer';

  console.log(`[SeedReviewer] Seeding verified reviewer account for Google Play Store: ${email}`);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        displayName,
        isVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`[SeedReviewer] Updated existing account to verified with password.`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName,
        isAnonymous: false,
        isVerified: true,
        tokenVersion: 1,
      })
      .returning();

    await db.insert(userProfiles).values({
      userId: created.id,
      reflectionDepth: 'balanced',
      mahabharataDensity: 'contextual',
      themePreference: 'dark',
      enableLongTermMemory: true,
      preferredLanguage: 'en',
    });
    console.log(`[SeedReviewer] Created new verified reviewer account.`);
  }

  console.log('[SeedReviewer] Verified credentials:');
  console.log(`  Username / Email: ${email}`);
  console.log(`  Password:         ${password}`);
}

seedReviewer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[SeedReviewer] Error:', err);
    process.exit(1);
  });

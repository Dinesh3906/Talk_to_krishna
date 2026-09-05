import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('[Migration Runner] Starting database migration check...');

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migration Runner] No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT version FROM _schema_migrations WHERE version = $1',
        [file]
      );

      if (rows.length === 0) {
        console.log(`[Migration Runner] Applying migration: ${file}...`);
        const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sqlContent);
          await client.query(
            'INSERT INTO _schema_migrations (version) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`[Migration Runner] Successfully applied ${file}`);
        } catch (migrationErr) {
          await client.query('ROLLBACK');
          console.error(`[Migration Runner] Failed to apply ${file}:`, migrationErr);
          throw migrationErr;
        }
      } else {
        console.log(`[Migration Runner] Migration ${file} is already applied.`);
      }
    }

    console.log('[Migration Runner] All migrations applied successfully.');
  } finally {
    client.release();
  }
}

// Allow direct execution via tsx
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[Migration Runner] Migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Runner Error]:', err.message);
      process.exit(1);
    });
}

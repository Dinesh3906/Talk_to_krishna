import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadMigrationManifest, migrationPrefix, MigrationManifestEntry } from './migration-manifest.js';

dotenv.config();

export type MigrationEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface MigrationTarget {
  environment: MigrationEnvironment;
  name: string;
  databaseUrl: string;
}

export interface MigrationClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
  end?(): Promise<void>;
}

const VALID_ENVIRONMENTS = new Set<MigrationEnvironment>(['development', 'test', 'staging', 'production']);

export function resolveMigrationTarget(env: NodeJS.ProcessEnv = process.env): MigrationTarget {
  const environment = env.MIGRATION_ENVIRONMENT as MigrationEnvironment | undefined;
  const name = env.MIGRATION_TARGET_NAME?.trim();
  const databaseUrl = env.MIGRATION_DATABASE_URL;
  const confirmation = env.MIGRATION_TARGET_CONFIRMATION;

  if (!environment || !VALID_ENVIRONMENTS.has(environment)) {
    throw new Error('Set MIGRATION_ENVIRONMENT to development, test, staging, or production.');
  }
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(name)) {
    throw new Error('Set MIGRATION_TARGET_NAME to the explicitly selected database target name.');
  }
  if (!databaseUrl) {
    throw new Error('Set MIGRATION_DATABASE_URL to the explicitly selected database; runtime DATABASE_URL is never used for migrations.');
  }
  if (confirmation !== `${environment}:${name}`) {
    throw new Error(`Confirm the migration target with MIGRATION_TARGET_CONFIRMATION=${environment}:${name}.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('MIGRATION_DATABASE_URL is not a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('MIGRATION_DATABASE_URL must use the PostgreSQL protocol.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if ((environment === 'development' || environment === 'test') && !isLocal) {
    throw new Error(`${environment} migrations are restricted to a loopback PostgreSQL target.`);
  }
  if ((environment === 'staging' || environment === 'production') && env.ALLOW_REMOTE_MIGRATIONS !== 'true') {
    throw new Error('Remote migrations require ALLOW_REMOTE_MIGRATIONS=true in the controlled deployment environment.');
  }
  if (environment === 'production') {
    if (env.NODE_ENV !== 'production') {
      throw new Error('Production migrations can only run from a production deployment environment, never a local development session.');
    }
    if (env.PRODUCTION_MIGRATION_APPROVAL !== name) {
      throw new Error('Production migrations require PRODUCTION_MIGRATION_APPROVAL to match MIGRATION_TARGET_NAME.');
    }
  }

  return { environment, name, databaseUrl };
}

function assertAppliedMigrationsAreKnown(
  rows: Array<Record<string, any>>,
  manifest: MigrationManifestEntry[],
): void {
  const currentByPrefix = new Map(manifest.map((entry) => [migrationPrefix(entry.file), entry.file]));
  const currentByName = new Map(manifest.map((entry) => [entry.file, entry]));
  const appliedByPrefix = new Map<string, string>();

  for (const row of rows) {
    const version = String(row.version);
    let prefix: string;
    try {
      prefix = migrationPrefix(version);
    } catch {
      throw new Error(`Database migration ledger contains an invalid migration identity: ${version}`);
    }

    const earlier = appliedByPrefix.get(prefix);
    if (earlier && earlier !== version) {
      throw new Error(`Database migration ledger has conflicting identities for version ${prefix}: ${earlier} and ${version}`);
    }
    appliedByPrefix.set(prefix, version);

    const expected = currentByName.get(version);
    if (!expected) {
      const currentName = currentByPrefix.get(prefix);
      if (currentName) {
        throw new Error(`Database migration ${version} conflicts with this release identity ${currentName}; reconcile migration history before applying changes.`);
      }
      throw new Error(`Database migration ${version} is absent from this release manifest; reconcile migration history before applying changes.`);
    }
    const recordedChecksum = row.checksum ? String(row.checksum).trim().toLowerCase() : null;
    if (recordedChecksum && recordedChecksum !== expected.sha256) {
      const isKnownLegacyWindowsHash = version === '0010_citation_evidence_provenance.sql' &&
        recordedChecksum === 'dbe34b09133e36c8a5aaee80228d3e60354f177b0f00c179b6644a26222b41c0';
      if (!isKnownLegacyWindowsHash) {
        throw new Error(`Database migration checksum mismatch for ${version}; restore the reviewed migration file or reconcile history before applying changes.`);
      }
    }
  }
}

export async function runMigrations(providedPool?: MigrationPool): Promise<void> {
  const target = resolveMigrationTarget();
  const manifest = loadMigrationManifest();
  const targetIsLocal = ['localhost', '127.0.0.1', '::1'].includes(new URL(target.databaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase());
  const migrationPool = providedPool || new pg.Pool({
    connectionString: target.databaseUrl,
    ssl: targetIsLocal ? false : { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
  });

  console.log('[Migration Runner] Selected target.', { environment: target.environment, target: target.name });
  let client: MigrationClient | undefined;
  try {
    client = await migrationPool.connect();
    const ledgerResult = await client.query("SELECT to_regclass('public._schema_migrations') AS ledger");
    const ledgerExists = Boolean(ledgerResult.rows[0]?.ledger);
    let appliedRows: Array<Record<string, any>> = [];
    let hasChecksumColumn = false;

    if (ledgerExists) {
      const columnResult = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '_schema_migrations'",
      );
      hasChecksumColumn = columnResult.rows.some((row) => row.column_name === 'checksum');
      const selectedColumns = hasChecksumColumn ? 'version, checksum' : 'version';
      const appliedResult = await client.query(`SELECT ${selectedColumns} FROM public._schema_migrations ORDER BY version`);
      appliedRows = appliedResult.rows;
      assertAppliedMigrationsAreKnown(appliedRows, manifest);
    }

    if (!ledgerExists) {
      await client.query(`
        CREATE TABLE public._schema_migrations (
          version VARCHAR(100) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          checksum CHAR(64)
        );
      `);
      hasChecksumColumn = true;
    } else if (!hasChecksumColumn) {
      await client.query('ALTER TABLE public._schema_migrations ADD COLUMN checksum CHAR(64)');
      console.warn('[Migration Runner] Existing migration rows have no stored checksums; their historical file contents cannot be verified.');
    }

    const applied = new Set(appliedRows.map((row) => String(row.version)));
    for (const migration of manifest) {
      if (applied.has(migration.file)) {
        console.log('[Migration Runner] Already applied.', { migration: migration.file });
        continue;
      }

      const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
      const sql = await fs.readFile(path.join(migrationsDir, migration.file), 'utf8');
      console.log('[Migration Runner] Applying.', { migration: migration.file });
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public._schema_migrations (version, checksum) VALUES ($1, $2)',
          [migration.file, migration.sha256],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log('[Migration Runner] Explicit migrations completed.', { target: target.name });
  } finally {
    client?.release();
    if (!providedPool) await migrationPool.end?.();
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runMigrations().catch((error: any) => {
    const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,16}$/.test(error.code) ? error.code : undefined;
    console.error('[Migration Runner] Failed. Database URL and query details were withheld.', { code });
    process.exitCode = 1;
  });
}

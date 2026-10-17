import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface MigrationManifestEntry {
  file: string;
  sha256: string;
}

export interface MigrationManifest {
  formatVersion: 1;
  migrations: MigrationManifestEntry[];
}

const DEFAULT_MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrationPrefix(file: string): string {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) throw new Error(`Invalid migration filename: ${file}`);
  return match[1];
}

export function validateMigrationIdentities(entries: MigrationManifestEntry[]): void {
  const filenames = new Set<string>();
  const prefixes = new Map<string, string>();

  for (const entry of entries) {
    const prefix = migrationPrefix(entry.file);
    if (filenames.has(entry.file)) throw new Error(`Duplicate migration identity: ${entry.file}`);
    filenames.add(entry.file);

    const previous = prefixes.get(prefix);
    if (previous && previous !== entry.file) {
      throw new Error(`Conflicting migration identities share version prefix ${prefix}: ${previous} and ${entry.file}`);
    }
    prefixes.set(prefix, entry.file);

    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid SHA-256 checksum in migration manifest for ${entry.file}`);
    }
  }
}

export function loadMigrationManifest(migrationsDir = DEFAULT_MIGRATIONS_DIR): MigrationManifestEntry[] {
  const manifestPath = path.join(migrationsDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as MigrationManifest;
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.migrations)) {
    throw new Error('Unsupported or malformed database migration manifest.');
  }

  validateMigrationIdentities(manifest.migrations);

  const manifestFiles = new Set(manifest.migrations.map((entry) => entry.file));
  const sqlFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
  const missing = [...manifestFiles].filter((file) => !sqlFiles.includes(file));
  const unlisted = sqlFiles.filter((file) => !manifestFiles.has(file));
  if (missing.length || unlisted.length) {
    throw new Error(`Migration manifest/file mismatch. Missing: ${missing.join(', ') || 'none'}; unlisted: ${unlisted.join(', ') || 'none'}.`);
  }

  for (const entry of manifest.migrations) {
    const rawSql = fs.readFileSync(path.join(migrationsDir, entry.file), 'utf8');
    const normalizedSql = rawSql.replace(/\r\n/g, '\n');
    const actualChecksum = crypto.createHash('sha256').update(normalizedSql).digest('hex');
    if (actualChecksum !== entry.sha256) {
      throw new Error(`Migration checksum does not match the reviewed manifest: ${entry.file}`);
    }
  }

  return manifest.migrations;
}

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
}

export async function assertSchemaCompatible(queryable: Queryable): Promise<void> {
  const manifest = loadMigrationManifest();
  let rows: Array<Record<string, any>>;
  try {
    const columns = await queryable.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '_schema_migrations'",
    );
    const hasChecksum = columns.rows.some((row) => row.column_name === 'checksum');
    ({ rows } = await queryable.query(
      `SELECT version${hasChecksum ? ', checksum' : ''} FROM public._schema_migrations ORDER BY version`,
    ));
  } catch {
    throw new Error('Database migration ledger is unavailable. Apply the reviewed migrations explicitly before starting the API.');
  }

  const expected = new Map(manifest.map((entry) => [entry.file, entry]));
  const appliedVersions = rows.map((row) => String(row.version));
  const appliedPrefixes = new Map<string, string>();
  for (const row of rows) {
    const version = String(row.version);
    let prefix: string;
    try {
      prefix = migrationPrefix(version);
    } catch {
      throw new Error(`Database migration ledger contains an unrecognized migration identity: ${version}`);
    }
    const previous = appliedPrefixes.get(prefix);
    if (previous && previous !== version) {
      throw new Error(`Database migration ledger has conflicting identities for version ${prefix}: ${previous} and ${version}`);
    }
    appliedPrefixes.set(prefix, version);
    if (!expected.has(version)) {
      throw new Error(`Database migration ${version} is not present in this release manifest. Reconcile migration history before starting the API.`);
    }
    const recordedChecksum = row.checksum ? String(row.checksum).trim().toLowerCase() : null;
    const expectedChecksum = expected.get(version)?.sha256;
    if (recordedChecksum && recordedChecksum !== expectedChecksum) {
      const isKnownLegacyWindowsHash = version === '0010_citation_evidence_provenance.sql' &&
        recordedChecksum === 'dbe34b09133e36c8a5aaee80228d3e60354f177b0f00c179b6644a26222b41c0';
      if (!isKnownLegacyWindowsHash) {
        throw new Error(`Database migration checksum mismatch for ${version}. Reconcile migration history before starting the API.`);
      }
    }
  }

  const applied = new Set(appliedVersions);
  const missing = manifest.filter((entry) => !applied.has(entry.file)).map((entry) => entry.file);
  if (missing.length) {
    throw new Error(`Database schema is missing required migrations: ${missing.join(', ')}. Apply them through the controlled migration command.`);
  }
}

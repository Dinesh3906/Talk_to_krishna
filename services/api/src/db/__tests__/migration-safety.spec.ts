import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { loadMigrationManifest, validateMigrationIdentities } from '../migration-manifest.js';
import { runMigrations, resolveMigrationTarget, MigrationClient, MigrationPool } from '../migrate.js';
import { startApiAfterSchemaCheck } from '../../server-startup.js';

const syntheticTarget = {
  MIGRATION_ENVIRONMENT: 'test',
  MIGRATION_TARGET_NAME: 'talk-to-krishna-disposable-test',
  MIGRATION_TARGET_CONFIRMATION: 'test:talk-to-krishna-disposable-test',
  MIGRATION_DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:55439/talk_to_krishna_test',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllEnvs();
});

function setSyntheticTarget(): void {
  for (const [key, value] of Object.entries(syntheticTarget)) {
    if (value !== undefined) vi.stubEnv(key, value);
  }
}

function fakePool(appliedRows: Array<Record<string, any>> = []): { pool: MigrationPool; calls: string[]; values: unknown[][] } {
  const calls: string[] = [];
  const values: unknown[][] = [];
  const client: MigrationClient = {
    async query(text, params = []) {
      calls.push(text);
      values.push(params);
      if (text.includes('to_regclass')) return { rows: [{ ledger: '_schema_migrations' }] };
      if (text.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'version' }, { column_name: 'checksum' }] };
      }
      if (text.startsWith('SELECT version, checksum')) return { rows: appliedRows };
      if (text.startsWith('INSERT INTO public._schema_migrations')) {
        appliedRows.push({ version: params[0], checksum: params[1] });
      }
      return { rows: [] };
    },
    release() {},
  };
  return { pool: { async connect() { return client; } }, calls, values };
}

describe('safe migration execution', () => {
  it('requires an explicit migration URL, environment, name, and confirmation', () => {
    expect(() => resolveMigrationTarget({} as NodeJS.ProcessEnv)).toThrow(/MIGRATION_ENVIRONMENT/);
    expect(resolveMigrationTarget(syntheticTarget)).toMatchObject({ environment: 'test', name: syntheticTarget.MIGRATION_TARGET_NAME });
  });

  it('rejects a remote URL for development or test and blocks local production runs', () => {
    expect(() => resolveMigrationTarget({
      ...syntheticTarget,
      MIGRATION_DATABASE_URL: 'postgresql://synthetic:synthetic@db.example.invalid/app',
    })).toThrow(/loopback/);

    expect(() => resolveMigrationTarget({
      ...syntheticTarget,
      MIGRATION_ENVIRONMENT: 'production',
      MIGRATION_TARGET_CONFIRMATION: 'production:talk-to-krishna-disposable-test',
      NODE_ENV: 'development',
      ALLOW_REMOTE_MIGRATIONS: 'true',
      PRODUCTION_MIGRATION_APPROVAL: 'talk-to-krishna-disposable-test',
    })).toThrow(/never a local development session/);
  });

  it('detects distinct migration files that reuse a numeric prefix', () => {
    expect(() => validateMigrationIdentities([
      { file: '0009_first.sql', sha256: 'a'.repeat(64) },
      { file: '0009_second.sql', sha256: 'b'.repeat(64) },
    ])).toThrow(/Conflicting migration identities share version prefix 0009/);
  });

  it('applies the reviewed manifest in order and records its checksums', async () => {
    setSyntheticTarget();
    const fake = fakePool();
    const manifest = loadMigrationManifest();

    await runMigrations(fake.pool);

    const inserts = fake.calls.filter((sql) => sql.startsWith('INSERT INTO public._schema_migrations'));
    expect(inserts).toHaveLength(manifest.length);
    expect(fake.values.filter((params) => params.length === 2).map((params) => params[1])).toEqual(manifest.map((entry) => entry.sha256));
    expect(fake.calls.filter((sql) => sql === 'BEGIN')).toHaveLength(manifest.length);
    expect(fake.calls.filter((sql) => sql === 'COMMIT')).toHaveLength(manifest.length);
  });

  it('rejects conflicting applied migration identities before any schema changes', async () => {
    setSyntheticTarget();
    const fake = fakePool([{ version: '0009_source_aware_indexes_and_provenance.sql' }]);

    await expect(runMigrations(fake.pool)).rejects.toThrow(/conflicts with this release identity 0009_expand_varchar_lengths/);
    expect(fake.calls.some((sql) => /^(CREATE|ALTER|BEGIN|INSERT)\b/i.test(sql.trim()))).toBe(false);
  });

  it('rejects a stored checksum that differs from the reviewed migration file', async () => {
    setSyntheticTarget();
    const first = loadMigrationManifest()[0];
    const fake = fakePool([{ version: first.file, checksum: '0'.repeat(64) }]);

    await expect(runMigrations(fake.pool)).rejects.toThrow(/checksum mismatch/);
    expect(fake.calls.some((sql) => /^(CREATE|ALTER|BEGIN|INSERT)\b/i.test(sql.trim()))).toBe(false);
  });

  it('checks schema compatibility with read-only SQL before listening', async () => {
    const manifest = loadMigrationManifest();
    const calls: string[] = [];
    let didListen = false;
    const database = {
      async query(text: string) {
        calls.push(text);
        if (text.includes('information_schema.columns')) return { rows: [{ column_name: 'version' }] };
        return { rows: manifest.map(({ file }) => ({ version: file })) };
      },
    };

    await startApiAfterSchemaCheck(database, () => { didListen = true; return 'server'; });

    expect(didListen).toBe(true);
    expect(calls).toEqual([
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '_schema_migrations'",
      'SELECT version FROM public._schema_migrations ORDER BY version',
    ]);
    expect(calls.join(' ')).not.toMatch(/CREATE|ALTER|INSERT|UPDATE|DELETE/i);
  });

  it('keeps migration execution out of the API entrypoint', () => {
    const entrypoint = fs.readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');
    expect(entrypoint).not.toMatch(/runMigrations|db:migrate/);
  });

  it('does not listen when the schema is incompatible', async () => {
    let didListen = false;
    await expect(startApiAfterSchemaCheck({
      async query() { return { rows: [{ version: '0009_source_aware_indexes_and_provenance.sql' }] }; },
    }, () => { didListen = true; })).rejects.toThrow(/not present in this release manifest/);
    expect(didListen).toBe(false);
  });

  it('does not listen when an applied migration has a conflicting checksum', async () => {
    let didListen = false;
    const manifest = loadMigrationManifest();
    await expect(startApiAfterSchemaCheck({
      async query(text: string) {
        if (text.includes('information_schema.columns')) return { rows: [{ column_name: 'version' }, { column_name: 'checksum' }] };
        return { rows: manifest.map(({ file, sha256 }) => ({ version: file, checksum: file === manifest[0].file ? '0'.repeat(64) : sha256 })) };
      },
    }, () => { didListen = true; })).rejects.toThrow(/checksum mismatch/);
    expect(didListen).toBe(false);
  });
});

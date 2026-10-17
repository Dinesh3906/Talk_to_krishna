# Database Schema & Migrations — Talk to Krishna

This document describes the PostgreSQL 16 schema, pgvector configuration, indexes, and versioned migration runner.

---

## 1. Schema Tables & Relationships

```
┌──────────────────┐          ┌───────────────────┐
│      users       │ 1      1 │   user_profiles   │
│ id (UUID, PK)    ├──────────┤ id (UUID, PK)     │
│ email (nullable) │          │ user_id (FK)      │
│ is_anonymous     │          │ reflection_depth  │
│ preferred_name   │          │ voice_speed       │
└────────┬─────────┘          └───────────────────┘
         │ 1
         ├────────────────────────────────────────┐
         │ *                                      │ *
┌────────┴─────────┐                    ┌─────────┴─────────┐
│  conversations   │                    │   user_memories   │
│ id (UUID, PK)    │                    │ id (UUID, PK)     │
│ user_id (FK)     │                    │ user_id (FK)      │
│ title, status    │                    │ memory_type, key  │
└────────┬─────────┘                    │ value (text)      │
         │ 1                            └───────────────────┘
         │ *
┌────────┴─────────┐
│     messages     │ 1
│ id (UUID, PK)    ├──────────────────────────────┐
│ conversation_id  │                              │ *
│ sender, content  │                    ┌─────────┴─────────┐
└──────────────────┘                    │ message_citations │
                                        │ id (UUID, PK)     │
                                        │ message_id (FK)   │
                                        │ chunk_id (FK)     │
                                        │ quote_type        │
                                        └───────────────────┘
```

### Additional System Tables
- `mahabharata_sources`: Metadata for canonical volumes, texts, and translations.
- `mahabharata_chunks`: Semantic chunks storing `embedding vector(768)` and `search_vector tsvector`.
- `ai_request_telemetry`: Non-PII performance metrics (latency, model, token usage, error status).
- `_schema_migrations`: Dedicated migration tracking ledger.

### Canonical Gita record count

The checked-in `data/mahabharata/corpus/gita_700_canonical.json` currently has **701 unique chapter/verse records across 18 chapters**. Its filename follows the common 700-numbered-verse convention, while this dataset also includes Bhagavad Gita 13.1, Arjuna's opening question in Chapter 13. [Swami Sivananda's commentary on 13.1 at IIT Kanpur's Gita Supersite](https://www.gitasupersite.iitk.ac.in/srimad?choose=1&ecsiva=1&etgb=1&etssa=1&field_chapter_value=13&field_nsutra_value=1&httyn=1&language=dv) explains that some editions omit the verse (or regard it as an interpolation) and that including it yields 701 verses. Keep the record and its `13.1` identity; do not normalize the count by deleting or renumbering it. The separate `bhagavad_gita.json` file contains chapter summaries and selected key verses, not the 701-record verse list. The current database count has not been verified in this workspace.

---

## 2. Nullable `preferred_name` Guarantee

In accordance with Non-Negotiable Rule #4, `preferred_name` is defined as:
```sql
preferred_name VARCHAR(50) NULL
```
There is **NO** `'Parth'` default value in the database. The field is truly optional and reflects solely user-supplied preferences.

---

## 3. Migration Runner

Versioned SQL migrations are executed through `services/api/src/db/migrate.ts`:
- Uses the reviewed `services/api/src/db/migrations/manifest.json` in the listed order. Every SQL file is SHA-256 checked before it can run.
- Executes each migration inside a PostgreSQL transaction and records its filename and checksum in `_schema_migrations`.
- Rejects duplicate version prefixes, unknown ledger entries, conflicting migration identities, and checksum mismatches before applying schema changes.
- API startup performs a read-only compatibility check against the manifest. It fails with an actionable error when the ledger is missing, has an unknown migration, or lacks a required migration.
- API startup never creates or alters `_schema_migrations` and never runs migrations.

### Controlled migration execution

Migrations require a separate `MIGRATION_DATABASE_URL`; the API's `DATABASE_URL` is never used as a fallback. Set an explicit environment, target name, and confirmation string before running `npm run db:migrate`:

```powershell
$env:MIGRATION_ENVIRONMENT = 'test'
$env:MIGRATION_TARGET_NAME = 'talk-to-krishna-disposable-test'
$env:MIGRATION_TARGET_CONFIRMATION = 'test:talk-to-krishna-disposable-test'
$env:MIGRATION_DATABASE_URL = 'postgresql://test_user:<test-password>@127.0.0.1:5432/talk_to_krishna_test'
npm run db:migrate
```

Development and test targets are restricted to loopback PostgreSQL hosts. Staging and production require `ALLOW_REMOTE_MIGRATIONS=true`; production also requires `NODE_ENV=production` and `PRODUCTION_MIGRATION_APPROVAL` to exactly match `MIGRATION_TARGET_NAME`. Never set those production gates in a local development shell. Review the target and migration manifest before every controlled deployment migration.

If an existing database has migration records absent from this checkout, or two identities share a numeric prefix, stop. Do not delete ledger rows or roll back SQL to get past the guard; reconcile the history with the database owner first. Historical rows created before checksum recording can be checked by identity but not by checksum.

The Render API start command only starts the API. Run the migration command separately from an explicitly configured deployment environment after review. The repository's local Compose service uses a persistent volume and is not treated as disposable test infrastructure.

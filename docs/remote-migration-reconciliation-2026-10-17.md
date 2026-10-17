# Remote migration reconciliation report — 2026-10-17

## Status

**Unresolved; database-owner review is required.** This report reconciles only the evidence captured during the 2026-10-17 production-readiness audit and the checked-out migration files. No database connection, schema query, migration, rollback, ledger edit, or data change was performed during this remediation sprint.

The API's automatic migration call has since been removed from startup, and the explicit migration runner now rejects unknown migration identities and duplicate numeric prefixes before it alters the ledger or schema. This prevents the checked-out `0009` from being applied again when the database history contains a different `0009` identity.

## Ledger entries observed in the audit

The audit's read-only ledger query before API startup showed:

- `0001` through `0008`
- `0009_source_aware_indexes_and_provenance.sql`

After the API started and its automatic runner completed, the audit observed both:

- `0009_source_aware_indexes_and_provenance.sql`
- `0009_expand_varchar_lengths.sql`

No timestamps or checksums for these rows are reproduced here because the audit artifact did not preserve them. The `0009_source_aware_indexes_and_provenance.sql` source file is not present in the audited checkout.

## Files in the audited checkout

The checked-out migration files were:

`0001_initial_schema.sql`, `0002_parent_child_chunks.sql`, `0003_add_google_auth.sql`, `0004_auth_otp_and_security.sql`, `0005_precomputed_search_vector.sql`, `0006_gita_verses_schema.sql`, `0007_conversation_memory_and_segments.sql`, `0008_persistent_safety_state.sql`, and `0009_expand_varchar_lengths.sql`.

The current remediation branch adds a reviewed `manifest.json` for the baseline files and a new migration, `0010_citation_evidence_provenance.sql`, for the citation identity columns. It does not add or reconstruct the missing `0009_source_aware_indexes_and_provenance.sql` migration.

The new `0010` migration adds nullable `evidence_id` and `evidence_source_type` columns to `message_citations` and an index on `evidence_id`. The controlled migration runner validates the manifest, checksums, and full migration identities before DDL; API startup performs read-only compatibility checks and will reject the unknown remote `0009` identity. Neither the new migration nor the runner was executed against the remote database.

## DDL executed by the unintended migration

The runner applied the checked-out `0009_expand_varchar_lengths.sql`. The exact SQL in that file is:

```sql
ALTER TABLE mahabharata_chunks
  ALTER COLUMN section TYPE varchar(255),
  ALTER COLUMN chapter TYPE varchar(255),
  ALTER COLUMN parva TYPE varchar(255),
  ALTER COLUMN source_reference TYPE varchar(255);

ALTER TABLE mahabharata_child_chunks
  ALTER COLUMN section TYPE varchar(255),
  ALTER COLUMN parva TYPE varchar(255),
  ALTER COLUMN source_reference TYPE varchar(255);
```

Thus the command requested type changes for four columns in `mahabharata_chunks` and three columns in `mahabharata_child_chunks`, and then recorded the filename in `_schema_migrations`. This description is based on the checked-out SQL and the audit's observation that the migration was applied. It is not a fresh inspection of the current remote catalog.

## Differences and unknowns

- The two `0009` filenames have different identities despite sharing the numeric prefix. The old runner compared full filenames, so it treated the local migration as unapplied and ran it.
- The DDL and intended effects of `0009_source_aware_indexes_and_provenance.sql` cannot be established from this checkout. Its name is not sufficient evidence to infer its SQL.
- The audit did not preserve the pre-migration data types, defaults, constraints, indexes, collations, table rewrite behavior, or a full schema snapshot for the seven altered columns.
- The ledger now contains both names according to the audit observation, but the audit did not preserve row checksums or a complete post-migration catalog dump.
- Whether `0009_expand_varchar_lengths.sql` was independently intended for this database remains unknown. The migration history and the intended release lineage must be established by the database owner.

## Recommended owner review

1. Preserve the current database and its backups. Do not delete either migration row, reverse the `varchar(255)` alterations, or edit migration history to make the application start.
2. Compare the current `_schema_migrations` table and relevant `pg_catalog` definitions with a pre-incident backup or schema snapshot.
3. Locate the exact `0009_source_aware_indexes_and_provenance.sql` artifact from the release that created its ledger row; verify its checksum and source commit independently.
4. Compare that exact migration with the checked-out `0009_expand_varchar_lengths.sql`, then review whether the two changes are both present in the live schema.
5. Reproduce the database from backup in an isolated clone. Test a forward-only reconciliation plan there, including data and index checks, before approving any production change.
6. Record the approved lineage and recovery plan. If reconciliation requires a new migration, assign it a new version and reviewed manifest entry; do not reuse `0009`.

No recovery SQL is proposed in this report. The owner should approve and test a concrete recovery plan before any remote schema change.

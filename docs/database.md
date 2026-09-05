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
- Reads migration scripts sequentially from `services/api/src/db/migrations/`.
- Executes inside isolated PostgreSQL transactions.
- Tracks execution timestamps in `_schema_migrations`.
- Application startup **never** mutates production schema automatically; migrations are executed via explicit deployment scripts (`npm run migrate`).

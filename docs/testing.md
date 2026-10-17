# Testing and Evaluation — Talk to Krishna

## Available commands

Run the API suite only after verifying that its effective database target is isolated. Some existing tests query PostgreSQL and corpus records.

```bash
npm --workspace=services/api run test
```

The isolated regression set added for remediation uses a synthetic loopback database URL and mocks database boundaries. It covers OTP delivery and verification, migration safety, HTTP security rules, retrieval/grounding, citation provenance, and effective model telemetry.

```bash
npm --workspace=services/api test -- \
  src/modules/auth/__tests__/otp-secret-safety.spec.ts \
  src/modules/auth/__tests__/otp-verification-atomicity.spec.ts \
  src/db/__tests__/migration-safety.spec.ts \
  src/__tests__/http-security.spec.ts \
  src/modules/ai/__tests__/conversation-intelligence-hardening.spec.ts \
  src/modules/ai/__tests__/model-telemetry.spec.ts
```

The offline retrieval evaluation sets a synthetic database URL, disables local embedding, and stubs the PostgreSQL query boundary to return no rows. It uses checked-in canonical Gita and Mahabharata episode data only. It does not measure production hybrid retrieval, model answers, or database-backed commentary retrieval.

```bash
npm --workspace=services/api run eval:retrieval:offline
```

Type-check the API after building shared types:

```bash
npm --prefix packages/shared run build
npx tsc -p services/api/tsconfig.json --noEmit
```

## Evaluation coverage and limits

`scripts/retrieval-evaluation-cases.json` contains 13 labeled retrieval cases: exact verses, ASCII and IAST transliteration, philosophical paraphrases, a commentary query, Mahabharata narrative, ambiguous and absent evidence, and similar but distinct verses. The commentary case requires database-backed source records and is reported as blocked by the offline evaluator.

This checkout does not contain the previously documented `test:eval` 100-question harness. The historical scores formerly listed here are not reproducible from a checked-in evaluator and are not current acceptance evidence. Do not treat them as a release pass.

Database integration, model-backed conversations, the 80-turn evaluation, lifecycle safety scenarios, and controlled concurrency tests require a verified disposable or staging environment. Keep them blocked when only a remote or unidentified database is configured. Do not use the runtime `DATABASE_URL` for migration or destructive test commands.

## Live conversation evaluation

`services/api/scripts/live-evaluation-harness.ts` runs the checked-in Gita, safety, and retrieval fixtures through an in-process Express API, the configured real model provider, the real retrieval pipeline, and PostgreSQL. It creates one synthetic test user and one persisted conversation per scenario, then sends each scenario's turns sequentially. The retrieval suite contains ten additional single-turn probes. Fixture expectations are evaluator metadata and are not sent to generation. Raw answers are written under the ignored `services/api/evaluation-results/` directory for human review; quality scores remain blank until a reviewer fills the five-dimension rubric.

Validate fixture counts without contacting a database or model:

```powershell
npm --workspace=services/api run eval:live -- --validate-only
```

For a live run, supply `TALK_TO_KRISHNA_EVAL_DATABASE_URL` from the approved disposable database secret source and set `TALK_TO_KRISHNA_EVAL_DATABASE_NAME` to its exact PostgreSQL database name. The name must begin with `talk_to_krishna_eval_`; the harness connects only to that explicit URL, checks `current_database()`, pgvector, corpus presence, and the read-only migration compatibility check, and never runs migrations. Configure `AI_PROVIDER`, that provider's API key, its fixed model, and the required JWT secret through the API environment without printing them. Run `npm --workspace=services/api run eval:live -- --suite all` only after verifying that the database is disposable and seeded with the intended corpus. The test-only evaluation trace is enabled only inside this harness's `NODE_ENV=test` process.

`all` records 90 turns: 40 Gita turns, 40 separate emotional/safety turns, and 10 retrieval probes. A completed run means only that the API returned and persisted its evidence; it is not a release pass. Review every answer, reference, source identity, citation, continuity transition, and safety response. Concurrency, controlled failure recovery, independently reviewed retrieval labels, and real PostgreSQL migration replay remain separate release checks.

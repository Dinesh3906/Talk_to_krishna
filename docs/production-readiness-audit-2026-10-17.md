# Talk to Krishna — Quality, Safety & Production-Readiness Audit

**Audit date:** 2026-10-17 (Asia/Kolkata)  
**Repository commit:** `d0744c2506e277847c6a949ed70a9c40dff85427`  
**Verdict:** **FAIL — NOT PRODUCTION-READY**  
**Scope note:** The codebase, automated suite, live model endpoint, read-only corpus queries, and a 10-query retrieval smoke set were inspected. The requested 80 application conversations and load tests were not run because the configured database is remote and is not identified as an isolated test database. No chat messages or conversation records were created.

> **Credential addendum (2026-10-17):** The later assertion in this historical report that a database credential was exposed in tool output is not independently verifiable from the current checkout. Final verification found both local `.env` paths ignored and absent from tracked files and Git history; local credential presence alone is not exposure. The alleged historical tool-output disclosure remains **INCONCLUSIVE** and is not a standalone release blocker. No credential was rotated or revoked. See [the final production-readiness verification](final-production-readiness-verification-2026-10-17.md).

## 1. Executive summary

The release fails the requested gate for three independently material reasons:

1. The production Resend OTP provider logs the plaintext verification code. The deployment manifest selects Resend, so this is a live authentication-secret exposure path (static code/config evidence).
2. A paraphrased, answerable Gita question missed its expected passage in a real retrieval call. It returned unrelated Mahabharata passages while labeling confidence `high` (direct runtime observation; one miss in a small smoke set).
3. Starting the API against the remote database automatically applied a local migration that was absent from that database's migration ledger. This changed remote schema metadata and exposed migration drift (direct runtime observation). The server was stopped immediately afterward; no rollback was attempted.

The 1,108 automated tests passed, and a real Groq model smoke call succeeded. Neither result establishes conversational quality, safety escalation, claim-level scriptural grounding, or production performance. No model-generated application answer was evaluated. The evidence is insufficient for persona scores, safety pass rate, citation metrics, or end-to-end latency.

## 2. Repository, commit, and environment

- Windows / PowerShell workspace; Node.js `v25.8.0`.
- Baseline commit: `d0744c2506e277847c6a949ed70a9c40dff85427`; branch `main` matched `origin/main` and was clean at inspection start.
- API workspace effective configuration: `NODE_ENV=development`, provider `groq`, model `openai/gpt-oss-20b`; the model credential was configured but is deliberately not reproduced here.
- PostgreSQL endpoint was remote. Read-only handshake reported PostgreSQL `18.6`; docs and Docker Compose describe PostgreSQL 16. The endpoint is not labeled staging/test in the inspected configuration.
- Embeddings use the code's local `BAAI/bge-base-en-v1.5` provider (768 dimensions); `EMBEDDING_MODEL_NAME` is not set in the API workspace.
- Audit window: 2026-10-17. Automated suite started at 09:43:47 local time and reported 21.96 seconds.
- Root and API `.env` files are ignored by Git. No full secret-history scan was performed.

## 3. Verified architecture and corpus inventory

### Architecture

- Client: Expo / React Native mobile app with API client and SSE chat flow.
- Backend: Express + TypeScript API. Conversation routes require bearer authentication and check conversation ownership.
- Generation: `AIProviderFactory` selected Groq. A single live provider smoke request returned `HEALTH_CHECK_OK` in 358 ms (one non-streaming sample; not an app response).
- Retrieval: PostgreSQL/pgvector vector and full-text paths, local BGE embeddings, a disk-backed Gita corpus path/fallback, query rewriting, and a retrieval reranker.
- Response pipeline: safety/input classification, conversation state and memory, response planning, generation, grounding/quote validation, citations, persistence, and telemetry.
- Database pool configuration in code: minimum 3, maximum 20 connections, 10-second connection timeout and 45-second statement timeout. The retrieval helper has its own wall-clock budget.
- Global IP rate limit is 300 requests per 15 minutes; auth routes are limited to 20 per 15 minutes. JSON request size is limited to 1 MB; chat content schema allows up to 4,000 characters.
- `index.ts` starts listening before running migrations and runs them automatically for every non-test process. This contradicts `docs/database.md`, which says production schema changes are explicit and startup does not mutate schema.

### Database and corpus (read-only observations)

PostgreSQL responded at version 18.6. The database recorded nine migrations before API startup. Source registry and chunk counts were:

| Source type | Registered title | Parent chunks | Child chunks |
|---|---|---:|---:|
| `pdf_volume` | Ramesh Menon, Complete Mahabharata Volumes 1–12 | 6,764 | 13,852 |
| `debroy_10_vol` | Bibek Debroy, Mahabharata Set of 10 Volumes | 3,561 | 13,597 |
| `gita_ashok_kaushik` | Ashok Kaushik Gita | 431 | 424 |
| `gita_raghavendra_vivruti` | Sri Raghavendra Teertha Gita Vivruti | 454 | 828 |

The dedicated `gita_verses` table contained 701 rows, 701 distinct IDs, 701 distinct chapter/verse references, one source edition, and no duplicate chapter/verse pairs. The checked-in file named `gita_700_canonical.json` also contained 701 unique records spanning all 18 chapters. This count/name mismatch needs an editorial decision; it is recorded as a discrepancy, not as proof that a verse is invalid. The two additional Gita editions above remain separately registered with distinct provenance. The two Mahabharata editions also remain separate in the registry.

### Migration drift and audit-side database change

Before starting the API, the remote ledger contained `0001`–`0008` and `0009_source_aware_indexes_and_provenance.sql`. That latter migration is absent from this checkout. The local checkout instead contains `0009_expand_varchar_lengths.sql`. API startup ran `runMigrations()` and applied that local file, which alters `section`, `chapter`, `parva`, and `source_reference` column types to `varchar(255)` on the specified chunk tables and adds its filename to `_schema_migrations`. The ledger now contains both distinct `0009_*` filenames.

This was an unintended remote schema mutation during the audit. The migration SQL contains `ALTER COLUMN TYPE` statements and no conversation/message inserts. I did not attempt rollback or run further schema-changing operations. A database owner should review the migration history and decide whether remediation is needed.

## 4. Baseline automated test results

Command: `npm --workspace=services/api run test`

| Result | Count |
|---|---:|
| Test files passed | 7 / 7 |
| Tests passed | 1,108 |
| Failed | 0 |
| Skipped | 0 reported |
| Duration | 21.96 s |

The suite includes deterministic conversation-intelligence tests and read-only database/corpus/retrieval integration checks. The Debroy suites queried actual registered records, counts, embeddings, and retrieval. The suite did not call `AIOrchestratorService` or a live generation provider; it is not an end-to-end conversation benchmark. The documented `test:eval` command is not present in `services/api/package.json`, so the claimed 100-question evaluation cannot be invoked from the current package scripts.

## 5. Scripted conversations: all 80 turns

**Executed: 0 / 80. Blocked: 80 / 80.** No application conversations were generated, so there are no transcripts, per-turn pass/fail judgments, or message citations to present. The live API path saves the user message and later writes the assistant message, citations, memory, and telemetry. The only configured database is remote and not explicitly identified as an isolated test target; running the 80 turns would write to that database, contrary to the no-production-data-change constraint.

| Scenario | Turns | Status |
|---|---:|---|
| 1. Karma Yoga and Results | 0/4 | BLOCKED — isolated writable test database unavailable |
| 2. Arjuna's Crisis and Self-Doubt | 0/4 | BLOCKED — same |
| 3. Attachment and Heartbreak | 0/4 | BLOCKED — same |
| 4. Dharma and Difficult Choices | 0/4 | BLOCKED — same |
| 5. Equanimity | 0/4 | BLOCKED — same |
| 6. Restless Mind | 0/4 | BLOCKED — same |
| 7. Anger and Revenge | 0/4 | BLOCKED — same |
| 8. Self-Worth and Comparison | 0/4 | BLOCKED — same |
| 9. Discipline and Practice | 0/4 | BLOCKED — same |
| 10. Surrender and Uncertainty | 0/4 | BLOCKED — same |
| 11. Height Insecurity | 0/4 | BLOCKED — same |
| 12. Sadness and Hopelessness | 0/4 | BLOCKED — same |
| 13. Lottery and Wealth | 0/4 | BLOCKED — same |
| 14. Breakup | 0/4 | BLOCKED — same |
| 15. Guilt After Cheating | 0/4 | BLOCKED — same |
| 16. Compulsive Sexual Behavior | 0/4 | BLOCKED — same |
| 17. Violent Anger | 0/4 | BLOCKED — same |
| 18. Suicidal Distress | 0/4 | BLOCKED — same |
| 19. Smoking Cessation | 0/4 | BLOCKED — same |
| 20. Exam Failure | 0/4 | BLOCKED — same |

## 6. Adversarial and robustness checks

- Full application-level adversarial scenarios executed: **0**. No production or remote-database prompt-injection, crisis, cross-user, or context-isolation probes were sent.
- Retrieval-only labeled smoke set executed: **10 queries** against the live retriever; targets were selected from the checked-in canonical Gita JSON and are not expert-reviewed labels.
- Live generation smoke: one short direct provider call. This verifies provider reachability only, not the application prompt, streaming, retrieval-to-generation, or safety layers.
- Existing automated tests cover several safety, grounding, continuity, and prompt-injection rules, but do not replace the requested live adversarial tests.

## 7. Claim-level scriptural grounding and retrieval

### Retrieval smoke results

The 10-query set yielded recall@1 **0.60**, recall@3 **0.90**, and MRR **0.733**. These figures are preliminary because the set is small and labels were not reviewed by an independent scripture specialist.

Critical miss: “What happens when someone repeatedly thinks about objects of desire?” expected Gita 2.62, but the top three were unrelated Debroy Mahabharata passages (Vol. 9 Moksha Dharma pages 3119 and 3114; Vol. 1 Ashvamedhika page 3539). The retriever reported confidence `high`. The target was not present in the top three.

Other results included Gita 2.63 at rank 3, Gita 6.6 at rank 2, and Gita 6.26 at rank 2. Several exact or thematic lookups used the disk/canonical fallback; other queries used hybrid database search. The observed query latencies ranged from 4 ms to 4,056 ms. With only 10 samples and mixed retrieval paths, these are smoke results, not reliable latency percentiles.

### Grounding measures

| Metric | Result |
|---|---|
| Citation resolution accuracy | N/A — no application answers/citations generated |
| Citation-to-claim semantic support | N/A — no generated claims to review |
| Scriptural factual error count | N/A — no generated answers reviewed |
| Unsupported scriptural claim rate | N/A — no generated answers reviewed |
| Retrieval recall on preliminary labeled set | Recall@1 0.60; recall@3 0.90; MRR 0.733; n=10 |
| Appropriate abstention rate | N/A — no generated answers reviewed |
| Provenance across indexed editions | Four distinct source types observed; source-specific claim attribution not tested end-to-end |

Static inspection shows the validators use deterministic text/regex/substring and metadata checks. For example, character support can be inferred from a name appearing in retrieved text/metadata, and a Gita passage can be attached when a response mentions the Gita. These checks may help reject obvious inventions but do not establish semantic entailment for every scriptural claim. No human claim-level review was performed.

## 8. Persona and conversation scorecard

All ten dimensions are **N/A** because there are no live conversation transcripts (n=0): empathy, teacher-like explanation, Krishna-inspired voice, scriptural integration, story relevance, practical application, continuity, progressive depth, naturalness, and epistemic humility. Do not interpret the unit tests' expected strings as persona performance evidence.

## 9. Safety and escalation audit

- Live safety scenarios and lifecycle follow-ups: **not run**; safety pass rate and severe live safety failure count are **N/A**.
- Automated unit suite passed, including safety-guard and response-validator cases in the conversation-intelligence suite. These validate code paths with deterministic inputs, not generated responses from the configured model.
- No live tests were made for suicidal escalation, changing risk over follow-ups, overdose/already-taken statements, violence proximity/means, recovery after denial, or safety behavior after a subject change.
- Static code contains input risk classification and response repair. Correctness, relevance, non-repetition, and model interaction remain unverified.

## 10. Performance, reliability, and concurrency

- Direct provider smoke: one non-streaming response, 358 ms.
- Retrieval smoke: n=10, 4–4,056 ms; descriptive only. Mixed disk and database paths.
- End-to-end TTFT / full-response latency and P50/P95/P99: **not measured**.
- Concurrency at 1/5/10/25 sessions: **not run**. The database endpoint was remote and its isolation/capacity was not established; load testing it would be unsafe.
- Timeout, retry, rate-limit, queue, CPU/RAM/GPU, and dependency-recovery rates: **not measured**.
- No service-level objectives were found in the inspected docs; production performance requirements are undefined.
- Startup did reach the API listening state and connected to PostgreSQL, but the startup hook applied the migration described above. No health endpoint or streamed chat request was exercised.

## 11. Security audit findings

### Findings by severity

**Historical claim — possible remote database credential exposure (INCONCLUSIVE; superseded).** The original audit stated that a diagnostic command printed a database connection string, but that alleged output cannot be independently inspected in the current checkout. The later assessment found the local `.env` files ignored and absent from tracked files and Git history; local credential presence does not establish disclosure. Do not treat this historical assertion as verified, do not infer compromise, and do not use it as a release blocker. No credential was rotated or revoked. See the credential addendum at the top of this report and the final verification.

**P1 — OTP code written to application logs.** `ResendOtpProvider.sendOtp` logs the plaintext verification code. The deployment manifest selects `EMAIL_PROVIDER=resend`. Anyone with log access could use a current code to verify or reset an account. Evidence: static code inspection and deployment configuration.

**P1 — Predictable fallback JWT signing secret.** `AuthService` falls back to a hard-coded development secret if `JWT_SECRET` is absent; the server does not fail startup. A production misconfiguration would make token forgery possible. Evidence: static code inspection; no forged token was tested.

**P2 — Dependency advisories.** `npm audit --omit=dev` exited 1 and reported 80 advisories in the workspace graph: 6 critical, 45 high, 29 moderate. The output includes critical transitive packages such as `protobufjs`, `proxy-addr`, `shell-quote`, `tar`, `tinypool`, and `vitest`, and direct findings including `drizzle-orm` and `@xenova/transformers`. The graph includes multiple workspaces and transitive/dev tooling; runtime exploitability was not triaged. No dependency changes were made.

**P2 — Permissive CORS and raw error details.** The server reflects any origin with credentials enabled. Several API error paths return raw exception messages, including database errors. These were not probed live; review allowed origins and user-facing error mapping. Evidence: static code inspection.

**P3 — Evaluation command documentation is stale.** `docs/testing.md` documents `test:eval`, but no such script exists in `services/api/package.json`. Evidence: static inspection.

## 12. Retrieval and data-integrity audit

- **Observed retrieval miss:** the paraphrase about repeatedly thinking about objects of desire did not return the expected Gita 2.62 in top 3; unrelated Debroy passages were ranked first and confidence was `high` (direct runtime observation).
- **Citation persistence risk:** retrieved citation IDs are checked only against `mahabharata_chunks`, and `message_citations.chunk_id` references only that parent table. Child-chunk and Gita IDs can therefore be stored with a null FK (static code/schema inspection; not exercised with a saved answer).
- **Telemetry provenance risk:** the provider reads `GROQ_MODEL_NAME`; telemetry uses `AI_MODEL_NAME` or the `llama-3.1-8b-instant` fallback. The inspected effective model was `openai/gpt-oss-20b` and `AI_MODEL_NAME` was unset (static code plus effective non-secret configuration).
- **Corpus count discrepancy:** the seed filename and docs say 700, but the file and DB each contain 701 unique references. There are no duplicate chapter/verse pairs, and all 18 chapters are present. The count should be reconciled against the selected edition (direct file/database observation; canonicality not judged).
- **Edition provenance:** four source types and separate source records were present. The two indexed Gita commentary sources and two Mahabharata translations remain distinguished by source type/title. No cross-edition semantic duplicate audit or source-specific claim review was completed.
- **Migration drift:** remote ledger contained `0009_source_aware_indexes_and_provenance.sql`, absent from the checkout. Startup applied the checkout's `0009_expand_varchar_lengths.sql`; the ledger now has both `0009_*` entries. The local runner cannot reproduce the remote migration set from this checkout (direct runtime/database observation).

## 13. Prioritized defect list

| Priority | Finding | Evidence |
|---|---|---|
| — | Historical claim of database credential exposure | **INCONCLUSIVE**; not a standalone blocker. Alleged tool output is unavailable for independent verification; no rotation or revocation was performed. |
| P1 | Resend provider logs plaintext OTP codes | Static code and deployment configuration |
| P1 | API startup applies migrations; migration inventory drift caused an unexpected remote schema change | Direct runtime observation |
| P1 | Paraphrase retrieval misses expected Gita verse while reporting high confidence | Direct retrieval observation, n=10 smoke set |
| P1 | JWT uses a predictable hard-coded fallback when configuration is missing | Static code inspection |
| P2 | Citation IDs from child/Gita records may not remain resolvable after persistence | Static code/schema inspection |
| P2 | Groq telemetry can report the wrong model name | Static code/configuration inspection |
| P2 | 80 dependency advisories require reachability triage; broad remediation may be breaking | `npm audit --omit=dev` output |
| P2 | CORS reflects arbitrary origins and API error paths expose raw exception messages | Static code inspection |
| P2 | Gita 700/701 declaration and database migration inventory are unreconciled | Direct file/database observation |
| P3 | Documented `test:eval` command is absent | Static package/docs inspection |

## 14. Reproduction steps

Use an isolated disposable database and synthetic data for all mutating checks:

1. OTP logging: invoke the Resend provider with a synthetic recipient/code and inspect captured application logs; acceptance is that no code or token appears.
2. Migration behavior: compare repository migration files with the ledger, then start the API against a disposable database; acceptance is that API startup performs no DDL and the migration runner reports a reproducible migration set.
3. Retrieval miss: run the exact query “What happens when someone repeatedly thinks about objects of desire?” with `HybridRetriever.retrieve(..., limit=3)` and verify the expected Gita 2.62 record is ranked.
4. JWT fallback: unset `JWT_SECRET` in an isolated process; acceptance is a startup/configuration failure rather than token signing with a built-in value.
5. Citation persistence: generate and save a citation from a child chunk and a Gita verse, then reload it; acceptance is a resolvable source ID for each citation type.
6. Model telemetry: run one isolated request with the configured Groq model and compare provider/model telemetry with the provider's effective model.
7. Dependency audit: repeat `npm audit --omit=dev`, triage advisories by workspace, production reachability, and exploit path; do not run broad breaking upgrades without compatibility tests.

## 15. Recommended fixes and acceptance criteria

1. **Credential assessment: INCONCLUSIVE.** The historical tool-output claim cannot be independently verified; local `.env` presence does not establish disclosure. No rotation is inferred as necessary from the available evidence, and this is not a standalone release blocker.
2. **P1: Remove OTP logging.** No OTP, reset token, bearer token, or equivalent secret may appear in logs under success or failure paths. Add a captured-log regression test.
3. **P1: Make production startup fail closed for secrets and disable startup migrations.** Require a strong explicit JWT secret; never use a built-in fallback. Apply migrations only via a controlled release step.
4. **P1: Reconcile and version migrations.** Restore the missing migration source or verify the remote ledger against the intended branch; renumber the local duplicate `0009` migration and validate the resulting schema against a clean database and a sanitized snapshot.
5. **P1: Fix and re-evaluate paraphrase retrieval.** The ten manually labeled cases must achieve a pre-agreed recall@k with expert-reviewed labels; no unrelated passage may be marked high-confidence for a scripture-specific answer.
6. **P2: Persist citations against the actual source table.** Support parent chunks, child chunks, and Gita verse IDs with typed provenance and successful save/reload resolution.
7. **P2: Record the effective provider model in telemetry.** Telemetry must match the model returned/used by the provider, including `GROQ_MODEL_NAME`.
8. **P2: Restrict CORS and sanitize errors.** Allow only configured origins; external responses must use stable error codes and not include database/provider internals.
9. **P2: Triage dependency findings and upgrade in compatible increments.** Resolve critical/high reachable runtime advisories, then run the complete workspace build and tests.
10. **P2/P3: Reconcile the 700/701 corpus declaration and restore the documented evaluation command.** Record edition-specific verse counts and provide a reproducible labeled benchmark.

## 16. Exact tests to rerun after fixes

- After auth/logging changes: `npm --workspace=services/api run test`, plus isolated signup/login/password-reset tests with captured logs and token-forgery checks.
- After migration changes: clean-database migration replay, upgrade from a sanitized schema snapshot, migration-ledger comparison, and database integration suites.
- After retrieval/citation changes: the 10-query smoke set plus an expert-reviewed labeled retrieval set; citation save/reload tests for all source types; claim-level review of every generated scriptural claim.
- After persona/safety changes: all 80 scripted turns in a disposable end-to-end environment, plus the specified safety/adversarial sequences and full conversation transcript review.
- After dependency changes: `npm audit --omit=dev`, shared/API/mobile builds, the 1,108-test suite, and runtime smoke tests.
- Before any deployment verdict: rerun the 80 turns, adversarial and crisis flows, retrieval benchmark, cross-user isolation, and controlled 1/5/10/25 session workload against a verified staging environment with documented SLOs.

## 17. Remaining uncertainties and limitations

- No live application answer was generated, so the app's actual voice, answers, citations, safety interventions, and continuity remain unscored.
- The 10 retrieval labels were not reviewed by a qualified scripture specialist and are too small for production-grade recall or ranking claims.
- No frontend UI session, authenticated synthetic account, streaming response, cross-user probe, safety lifecycle, or load test was run.
- No full dependency exploitability triage, Git-history secret scan, retention/deletion test, or log-content runtime test was completed.
- The deployment intent/SLO and whether the remote database is staging or production were not established.
- The earlier audit report records an unexpected migration during startup; database owners should review migration state before further database-backed testing. Its separate credential-output claim is inconclusive and is not evidence of exposure.

## 18. Final release decision

**FAIL — NOT PRODUCTION-READY.** The OTP log path exposes authentication codes, retrieval missed an expected canonical verse in a live paraphrase query, and startup performed an unexpected remote schema migration due to migration drift. The required 80-turn quality/safety audit and end-to-end performance/security tests are still blocked. Do not grant production sign-off until the verified P1 findings are resolved, migration state is reconciled, and the required suite is rerun in a verified isolated staging environment. Credential exposure is inconclusive and is not the reason for this verdict.


# Talk to Krishna — Final Production Readiness Verification

**Date:** 2026-10-17 (Asia/Kolkata)  
**Branch:** `codex/critical-hardening-2026-10-17`  
**Baseline / HEAD:** `d0744c2506e277847c6c949ed70a9c40dff85427`  
**Working tree:** prior remediation and this verification remain uncommitted. No commit, push, remote migration, or provider request was made. One authorized, read-only production database preflight was performed after the first draft of this report; it made no schema or data changes.  
**Verdict:** **FAIL — NOT PRODUCTION-READY**

This report supersedes the earlier release-blocker reports where their credential classification or current test status differs. The fail verdict is supported by independent release gates: the unresolved migration lineage, five production dependency findings including one critical, and blocked mandatory live application evaluations. Credential exposure is **inconclusive** and is not being used as a standalone blocker.

## 1. Executive summary

Code-level hardening and an auditable live-evaluation harness are present in the working tree. The API builds; 1,121 database-independent tests pass; the Gita, safety, and retrieval fixtures validate at 40, 40, and 10 turns respectively. A canonical edition identity loss found during this pass is fixed in the retrieval and citation path.

The full database-backed and model-backed acceptance work could not run. The host has no active Docker daemon, PostgreSQL service/listener, or PostgreSQL binaries. After the report's initial checks, an explicitly authorized read-only preflight connected to the configured Neon production branch and confirmed the production database identity. No data or schema was changed, no migration was run, and no configured model was contacted. The live harness therefore remains at **0/40 Gita turns, 0/40 emotional/safety turns, and 0/10 live retrieval probes**. A blocked run is not a pass.

The production dependency audit still reports **five findings (four high, one critical)** in the legacy BGE embedding runtime. The read-only production preflight confirmed conflicting `0009` identities and absent citation columns expected from migration `0010`. These facts, along with the harness's production-target guard, prevent a safe live evaluation against this database.

## 2. Baseline, worktree, and changes

- HEAD remains `d0744c2506e277847c6c949ed70a9c40dff85427` on `codex/critical-hardening-2026-10-17`.
- Existing remediation work and this pass are uncommitted. The branch has not been reset, committed, or pushed.
- Earlier remediation changes remain across auth/OTP, request security, retrieval, model telemetry, startup/migrations, dependencies, and the reports linked below.
- This pass adds `services/api/scripts/evaluation-scenarios.json` and `services/api/scripts/live-evaluation-harness.ts`, with a test-only API trace event in the authenticated message stream. The harness requires an explicitly supplied database URL and an exact database name beginning `talk_to_krishna_eval_`; it performs only read-only schema compatibility checks before creating synthetic evaluation users/conversations.
- This pass also carries canonical `sourceEdition` through Gita loading and retrieval, keeps the edition in the existing citation source field, adds a regression test, and documents the Gita count convention.
- Updated files include `docs/database.md`, `docs/testing.md`, the shared `StreamChunk` type, the API orchestrator/retriever/chat route, API package scripts, `.gitignore`, and three historical report addenda. A new dated report preserves the earlier reports.

## 3. Verified architecture and source inventory

Static checkout inspection confirms an Expo/React Native client and Express/TypeScript API using Drizzle and PostgreSQL. The API code uses local BAAI/bge-base-en-v1.5 embeddings with 768 dimensions, canonical Gita retrieval, pgvector and PostgreSQL full-text paths for Mahabharata material, reranking, confidence/grounding checks, streamed model output, citation construction, and conversation memory. `render.yaml` declares Groq and a model name; the effective deployed configuration was not queried.

The checked-in `data/mahabharata/corpus/gita_700_canonical.json` contains **701 unique chapter/verse records across 18 chapters**. Chapter 13 has 35 records because this data includes Arjuna's question at 13.1. Swami Sivananda's commentary on that verse explains that some editions omit it or regard it as an interpolation and that including it produces a total of 701; the common 700 count omits that additional numbered record. The data remains unchanged. The separate `bhagavad_gita.json` has 18 chapter-summary entries and 29 selected key-verse entries; it is not the canonical verse list. [IIT Kanpur Gita Supersite: Swami Sivananda's commentary on 13.1](https://www.gitasupersite.iitk.ac.in/srimad?choose=1&ecsiva=1&etgb=1&etssa=1&field_chapter_value=13&field_nsutra_value=1&httyn=1&language=dv)

The authorized read-only preflight observed 701 `gita_verses`, 11,210 `mahabharata_chunks`, and 28,701 `mahabharata_child_chunks` on the configured production database at the time of inspection. These counts are target- and time-specific, not guarantees of current contents. The checked-in corpus count explanation above remains applicable.

## 4. Confirmed defects and changes

- **Canonical Gita edition identity was dropped:** the loader did not preserve the checked-in `sourceEdition`, so canonical citations could be reduced to a generic “Bhagavad Gita” label. The loader and direct verse lookup now retain the edition; `QuoteVerifier` puts the exact edition in the existing persisted `source` field. The canonical source label is 92 characters, within the existing 100-character column. A regression test checks both loading and citation identity. No schema migration was needed.
- **Evaluation evidence was not exposed to a reproducible live harness:** the orchestrator already returned retrieval and grounding audit data, but the HTTP route did not expose it. An authenticated, opt-in SSE event now returns that record only when both `NODE_ENV=test` and `TALK_TO_KRISHNA_EVALUATION_TRACE=true`. It includes query rewriting, per-channel candidate ranks and score components, final ranked evidence, confidence/abstention fields, source identities, safety audit, effective provider/model, and timings.
- **OTP code logging:** current Resend logging contains delivery status metadata only; the console provider is disabled in production. The OTP logging regression tests are included in the passing database-independent suite. This verifies code behavior under tests, not deployed log retention.
- **Migration startup:** the existing remediation removes schema-changing migration execution from ordinary API startup and keeps startup checks read-only. The explicit migration runner has target, environment, identity, checksum, and approval guards. These controls passed unit coverage; they have not been verified on real PostgreSQL in this pass.

## 5. Credential assessment

**Status: INCONCLUSIVE regarding unauthorized access or use.** One user-supplied screenshot in this conversation visibly contains a database connection credential. Its value is not reproduced here or in command output. This confirms visibility in this chat, but there is no evidence in this audit that an unauthorized party accessed or used the credential. Both local `.env` paths are ignored by Git and absent from tracked files and Git history. `gitleaks` is not installed, and no comprehensive external log scan was performed.

No credential was rotated, revoked, copied, or modified. The exposure claim remains inconclusive as to unauthorized access; this fact is not used as a standalone release blocker. Earlier audit text now has an addendum reflecting the current assessment.

## 6. Migration lineage and database protection

The authorized read-only query verified the configured endpoint is the Neon project and `production` branch shown in the supplied screenshots, database `neondb`, running PostgreSQL `18.6 (653b019)` with pgvector `0.8.6`. The ledger contains versions `0001` through `0008` and two conflicting version-`0009` identities: `0009_expand_varchar_lengths.sql` and `0009_source_aware_indexes_and_provenance.sql`. The `message_citations.evidence_id` and `message_citations.evidence_source_type` columns expected by the citation migration are absent. `gita_verses.source_edition` is present. The read-only query also confirmed the corpus counts in Section 3.

This production contact was read-only. The repository's existing `assertSchemaCompatible` check was run against production in a read-only transaction and exited with: `Database migration ledger has conflicting identities for version 0009: 0009_expand_varchar_lengths.sql and 0009_source_aware_indexes_and_provenance.sql`. No migration was applied, no data or schema changed, the missing `0009` was not reconstructed, ledger rows were not deleted, and no reverse DDL was invented. The existing persistent `.pgdata` directory was not used.

The live evaluation harness requires the explicitly named database to start with `talk_to_krishna_eval_`; it rejects production `neondb`. Independently, the read-only compatibility check rejects this production ledger's duplicate `0009` identities, and the expected citation columns are missing. The live harness was not run and neither guard was bypassed. A PGlite experiment in a temporary OS directory failed on the first `0001_initial_schema.sql` migration with SQLSTATE `0A000`; no migration completed. PGlite is not native PostgreSQL compatibility evidence. This host also has Docker stopped and no `psql`, `pg_ctl`, `initdb`, `postgres`, active local PostgreSQL service, or port-5432 listener. The two PostgreSQL integration suites fail at pre-warm with `ECONNREFUSED 127.0.0.1:1` when run with the deliberately synthetic test URL. Real clean replay, supported-schema migration, rollback, duplicate/unknown identity, checksum, and startup ledger behavior remain unverified against a compatible native PostgreSQL target.

**Owner action:** preserve backups, provide the exact historical `0009_source_aware_indexes_and_provenance.sql` and its source commit, reconcile the duplicate version identity under an approved forward-only plan, and verify the resulting schema on a newly provisioned isolated native PostgreSQL instance. Do not bypass the harness target guard or apply the reconciliation to production as part of this evaluation.

## 7. Production dependency audit and embedding compatibility

`npm audit --workspace=services/api --omit=dev` exited **1** and reported **5 findings: 4 high, 1 critical**. `npm ls` confirmed the installed path:

| Package | Installed version | Severity | Production path |
|---|---:|---|---|
| `@xenova/transformers` | 2.17.2 | High | Direct API dependency |
| `onnxruntime-web` | 1.14.0 | High | Xenova → ONNX runtime |
| `onnx-proto` | 4.0.4 | High | Xenova → ONNX runtime → ONNX proto |
| nested `protobufjs` | 6.11.6 | **Critical** | Xenova → ONNX runtime → ONNX proto → protobufjs |
| `sharp` | 0.32.6 | High | Direct Xenova dependency |

The app requires Xenova for local query embeddings, so this dependency path is part of its production runtime. This audit establishes installed vulnerable packages, not exploitability of every advisory code path. The unrelated Google SDK's top-level `protobufjs@7.6.6` is not the vulnerable nested path reported by npm.

The earlier closure report recorded 11 findings before compatible-range package updates; this pass did not audit a clean baseline checkout using the same tool run. Treat the difference as a report comparison, not a quantified before/after claim. The current five findings remain unresolved.

The local BGE component evaluation completed on Node 25.8 with 701 canonical records and 9 labeled queries: Hit@1 **2/9**, Recall@5 **2/9**, MRR **0.2414**. Model load plus document embedding took **9,798 ms**, document embedding **9,685 ms**, and embedding all nine queries **62 ms**. This was component-only; no PostgreSQL, full-text retrieval, fusion, reranking, confidence assessment, or generation was used. The labels are not independently specialist-reviewed, and no memory measurement was collected. These figures do not demonstrate deployed RAG quality or a production-ready runtime swap.

The earlier compatibility experiment found `onnxruntime_binding.node` load failures with `@huggingface/transformers` candidates 4.3.1 and 3.8.1 on the tested Windows environments (Node 22.23.3 and, for one candidate, Node 25.8). That is platform-specific evidence, not proof of universal incompatibility. No replacement was selected; model/tokenizer, pooling, normalization, dimensions, indexed vectors, runtime stability, and production deployment compatibility have not all passed acceptance.

## 8. 40-turn Bhagavad Gita evaluation

**BLOCKED: 0/40 turns run.** The harness contains the ten supplied scenarios with four sequential messages per conversation. No real API conversation, retrieval, generation, memory continuity, citation, or human scoring occurred. Do not infer a pass from offline retrieval.

## 9. Separate 40-turn emotional and safety evaluation

**BLOCKED: 0/40 turns run.** The harness contains ten separate four-turn safety scenarios with controlled synthetic prompts, including the suicide and violence sequences. No live safety response or follow-up continuity was evaluated; no emergency service or external contact was triggered.

## 10. Ten live retrieval and citation probes

**BLOCKED: 0/10 live probes run.** Fixtures cover exact BG 2.62, the original paraphrase, a second paraphrase, transliteration, Raghavendra commentary, adjacent 2.63, a Mahabharata narrative query, an ambiguous request, absent modern evidence, and a claim unsupported by a valid verse reference. Expected behavior is evaluator metadata and is not sent to generation.

Separate offline evidence: `eval:retrieval:offline` exited 0 with 13 dataset cases, 12 scored and 1 database-blocked. It reported 10 positive cases, Hit@1 **10/10** (Wilson 95% interval **[0.7225, 1.0]**), Recall@5 **10/10**, Recall@10 **10/10**, MRR **1.0**, and abstention accuracy **2/2**. This is a deterministic canonical-disk evaluation with no generated answer and a synthetic database boundary; its labels are not an independent scripture review. It does not substitute for the ten live probes.

## 11. Citation persistence and conversation memory

**BLOCKED:** no staging conversation was created, reloaded, or inspected. The new harness records each real API conversation ID, sequential turns, retrieval trace, stream citations, reloaded citations, edition/source type, canonical reference, parent chunk where applicable, and evidence ID. It checks that persisted citations refer to retrieved evidence. These checks have only been fixture/type/build verified, not exercised against PostgreSQL. The harness records no automatic quality score.

## 12. Safety regression results

The database-independent suite passed its static/unit safety and OTP checks. **No live crisis, violence, or severe-distress response was evaluated.** The controlled 40-turn safety suite remains mandatory and blocked. Unit behavior does not establish safety across provider output or conversation persistence.

## 13. Performance, concurrency, and recovery

No end-to-end latency, p50/p95/p99, time-to-first-token, concurrent sessions, pool behavior, timeout recovery, or abandoned-stream cleanup measurements were taken. There are no approved service objectives in the inspected evidence, so no pass thresholds were invented. The 1/5/10/25-session tests remain blocked until isolated integration succeeds and owners define SLOs.

## 14. Commands and actual results

| Command | Exit | Evidence |
|---|---:|---|
| `npm --workspace=services/api run build` | 0 | Shared package and API TypeScript build succeeded. |
| `npm --workspace=services/api run test -- --exclude='**/debroy-10-volume-ingestion-and-retrieval.spec.ts' --exclude='**/debroy-10-confirmation-tests.spec.ts'` | 0 | 12 files; 1,121 tests passed. Synthetic loopback URL; no live DB. |
| `npm --workspace=services/api run test` | 1 | 1,121 passed, 24 skipped; two PostgreSQL integration files failed in `beforeAll` at the synthetic `127.0.0.1:1` connection. |
| `npm --workspace=services/api run eval:live -- --validate-only` | 0 | Fixture counts validated; explicitly contacted no database or model. |
| `npm --workspace=services/api run eval:retrieval:offline` | 0 | Offline evidence summarized above. |
| `npm --workspace=services/api run eval:bge:component` | 0 | Component-only evidence summarized above. |
| `npm audit --workspace=services/api --omit=dev` | 1 | Five production findings (four high, one critical). |
| `git diff --check` | 0 | No whitespace errors. |

No API-backed model-generation command was run. The only production DB activity was the authorized read-only preflight described above. No real PostgreSQL integration command succeeded.

## 15. Blocked tests and reasons

- Real migration replay, rollback and ledger compatibility: the production ledger currently fails the API's read-only compatibility check; no positively identified disposable native PostgreSQL service is available.
- 40 Gita turns, 40 separate safety turns, and ten live retrieval probes: the production name is rejected by the evaluation harness, and the schema compatibility check fails; not run. A compatible isolated PostgreSQL target and configured real provider are still required.
- Citation save/reload, user ownership, message retention, and conversation-memory continuity: require real database-backed API requests; not run.
- Concurrent workload, recovery, streaming cancellation, and SLOs: integration prerequisites and owner-approved objectives are absent.
- Embedding runtime replacement: compatibility and retrieval acceptance criteria are not met; no production switch made.

## 16. Remaining risks ranked P0–P3

- **P0:** none established by this verification. The historical credential-output claim is inconclusive, not a confirmed exposure.
- **P1:** unresolved critical/high production findings in the active Xenova embedding dependency path; conflicting remote `0009` migration identities; mandatory live evaluations and real database integrity checks remain blocked.
- **P2:** local BGE component ranking is poor on the nine-query labeled set; live hybrid retrieval quality, provider generation, source claim support, conversation ownership, and production performance remain unverified. The offline metric is not comparable to live retrieval.
- **P3:** the earlier transformer compatibility trial directory `.tmp-transformers-compat-eval/` remains untracked from previous work; it is outside the API dependency graph and contains trial files/lockfile snapshots, not application output. It was not removed.

## 17. Reproduction

Validate fixtures without infrastructure:

```powershell
npm --workspace=services/api run eval:live -- --validate-only
```

For the live run, first provision, seed, and positively identify a disposable PostgreSQL database with a compatible migration ledger and pgvector. Supply `TALK_TO_KRISHNA_EVAL_DATABASE_URL` through the approved secret source and set `TALK_TO_KRISHNA_EVAL_DATABASE_NAME` to the exact `talk_to_krishna_eval_*` name. Configure one explicit real `AI_PROVIDER`, its key/model, and JWT secret in the API process. Then run:

```powershell
npm --workspace=services/api run eval:live -- --suite all
```

The harness creates one synthetic user and conversation for each scenario and stores results under ignored `services/api/evaluation-results/`. Its status means execution and persistence only; a reviewer must score all five dimensions and inspect citations and safety before assigning any release decision. The harness does not apply migrations.

## 18. Final release recommendation

**FAIL — NOT PRODUCTION-READY.** Keep production sign-off blocked until the database owner resolves migration lineage through an approved forward-only plan; the critical production dependency is mitigated or has an explicitly approved risk disposition; the live 40-turn Gita, 40-turn safety, and ten retrieval suites pass against isolated real PostgreSQL and the configured provider; citation provenance, ownership, and memory persistence are verified; and concurrency/recovery tests run against defined service objectives. The production database was only inspected read-only; its incompatible migration ledger and the harness's production-target guard blocked evaluation. Credential visibility in the supplied screenshot is confirmed, but unauthorized access or use remains inconclusive and is not the reason for this verdict.

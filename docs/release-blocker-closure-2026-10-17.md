# Remaining Release Blockers Closure Report

**Date:** 2026-10-17 (Asia/Kolkata)  
**Branch:** `codex/critical-hardening-2026-10-17`  
**Baseline:** `d0744c2506e277847c6c949ed70a9c40dff85427`  
**Verdict:** **FAIL — NOT PRODUCTION-READY**

The existing remediation work remains uncommitted. No commit or push was made. This report extends [the remediation report](remediation-report-2026-10-17.md). No remote database or provider control plane was contacted during this closure pass, and migration `0010` was not applied remotely.

> **Credential addendum (2026-10-17):** This report's earlier credential-exposure assertion has been reassessed. The alleged historical tool-output disclosure cannot be independently verified; both local `.env` paths are ignored and absent from tracked files and Git history. Exposure is **INCONCLUSIVE**, local presence alone is not exposure, and no rotation was performed. This item is not a standalone release blocker; see [the final production-readiness verification](final-production-readiness-verification-2026-10-17.md).

## Closure summary

| Priority | Blocker | Status | What is still needed |
|---|---|---|---|
| — | Historical credential-output claim | **INCONCLUSIVE** | Not a standalone release blocker; repository review found no tracked `.env` or `.env` history, and the earlier output cannot be independently inspected. |
| P1 | Conflicting remote migration lineage | **BLOCKED** | Database owner must recover the missing `0009` artifact and approve a forward-only reconciliation tested on an isolated clone. |
| P1 | Embedding dependency advisories | **BLOCKED** | A compatible runtime replacement must pass model, retrieval, consistency, and performance checks. One critical protobuf advisory remains. |
| P1 | Real retrieval and citation persistence | **BLOCKED** | Requires an identified disposable PostgreSQL database and live hybrid retrieval/save/reload evidence. |
| P1 | 80-turn conversational and safety evaluation | **BLOCKED** | Requires the isolated database and configured model/provider. **0/80 turns** were run. |
| P1 | Load and recovery evaluation | **BLOCKED** | Requires passing integration tests and documented service objectives. |

## 1. Historical credential-exposure claim — reassessed

### Finding and scope

The earlier audit claimed that a diagnostic command printed the API database connection string. That output is not available for independent inspection in this checkout. The current repository check found the root and API `.env` files ignored by Git and absent from tracked files and Git history; those facts establish only that local configuration exists outside version control, not that its values were disclosed. The alleged disclosure is **INCONCLUSIVE**. No credential value is reproduced here.

The earlier audit separately reported that API startup ran an automatic migration and changed seven column types plus the migration ledger. This historical database-mutation report does not establish that the connection string appeared in the alleged tool output, and it does not establish the role's complete grants. The current closure pass did not contact that database.

### Action and remaining uncertainty

No rotation or revocation was performed. Since exposure is inconclusive, this item is not a standalone release blocker and no rotation is inferred as necessary from the available evidence. The code change that separates runtime `DATABASE_URL` from explicitly selected `MIGRATION_DATABASE_URL` is a migration safety control, not evidence about whether a secret was disclosed.

The alleged historical output cannot be verified from the repository. No provider-side audit or comprehensive external log scan was performed. Classify exposure as **INCONCLUSIVE**, not confirmed or disproven, and do not describe the credential as compromised based on this report.

**Changed files:** None for the secret; it was not modified. **Verification:** secret-safe repository/configuration metadata review only. **Result:** exposure INCONCLUSIVE; no rotation. **Uncertainty:** historical tool output, external logs, and provider-side state are unavailable.

## 2. Remote migration reconciliation

### Verified code and isolated tests

The existing branch has a reviewed SHA-256 migration manifest, an explicit migration command with named target and approval checks, transactional execution, and read-only startup compatibility checks. Startup refuses unknown migration identities and conflicting checksums. The missing historical `0009_source_aware_indexes_and_provenance.sql` was not reconstructed, neither `0009` row was removed, and no recovery SQL was invented.

The focused migration-safety suite passed **10 tests** inside the 81-test run. It uses a fake PostgreSQL client and verifies manifest order/checksums, target guards, duplicate `0009` rejection, and compatible/incompatible read-only startup checks. It does not establish a real PostgreSQL replay or the live remote catalog. `0010_citation_evidence_provenance.sql` remains unapplied remotely.

### Owner evidence required

The database owner must preserve backups and provide the full migration ledger with timestamps/checksums, the exact source and source commit for the missing `0009`, and pre/post schema evidence for the seven columns affected by the earlier command. The owner must compare that evidence on an isolated clone, approve a forward-only reconciliation plan, and demonstrate a clean PostgreSQL replay before application release. The original remote history remains unresolved until then.

This host still has no available Docker daemon, PostgreSQL service/listener, or PostgreSQL command-line/server binaries. The repository contains a persistent `.pgdata` directory, and `docker-compose.yml` uses a named persistent volume; neither was used as a disposable database.

**Root cause:** the prior audit applied local `0009_expand_varchar_lengths.sql` under a history that already had a different `0009` identity; the exact source for that earlier migration is absent. **Changed files:** existing remediation changes in `services/api/src/db/migrate.ts`, `services/api/src/db/migration-manifest.ts`, `services/api/src/server-startup.ts`, `services/api/src/db/migrations/manifest.json`, `services/api/src/db/migrations/0010_citation_evidence_provenance.sql`, migration-safety tests, `render.yaml`, and `docs/database.md`. **Verification:** the migration-safety tests pass inside the focused command listed below; no real PostgreSQL command was run. **Uncertainty:** source lineage and live catalog remain owner-dependent.

## 3. Dependency remediation

### Closed findings

The initial API production audit had 11 findings. Compatible-range updates have now moved these packages to patched releases without changing the API's declared ranges:

| Package | Before | Current |
|---|---:|---:|
| `express` | 4.22.2 | 4.22.3 |
| `body-parser` | 1.20.6 | 1.20.8 |
| `qs` | 6.15.3 | 6.16.1 |
| `proxy-addr` | 2.0.7 | 2.0.8 |
| `ip-address` | 10.7.0 | 10.7.4 |
| `express-rate-limit` | 8.7.0 | 8.7.1 |
| `shell-quote` | 1.10.0 | 1.12.0 |

The test runner was missing from the API workspace manifest despite the existing test script. It is now declared as the development dependency `vitest@5.0.5`; the OTP test mock now uses a constructible `Resend` class, matching the production constructor. The lockfile dry-run reports the dependency tree up to date. The focused tests pass with this runner.

### Remaining production findings

`npm audit --workspace=services/api --omit=dev` now reports **five findings: four high and one critical**. All five are in the legacy embedding stack:

| Package | Installed version | Severity | API dependency path |
|---|---:|---|---|
| `@xenova/transformers` | 2.17.2 | High | Direct API runtime dependency |
| `onnxruntime-web` | 1.14.0 | High | `@xenova/transformers` → `onnxruntime-web` |
| `onnx-proto` | 4.0.4 | High | `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` |
| `protobufjs` | 6.11.6 | **Critical** | `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` → nested `protobufjs` |
| `sharp` | 0.32.6 | High | `@xenova/transformers` → `sharp` |

The installed top-level `protobufjs@7.6.6` from `@google/genai` is outside the affected path; the vulnerable copy is the nested `6.11.6` under `onnx-proto`. The audit's suggested `@xenova/transformers@1.4.2` is a breaking downgrade, so it was not applied.

**Root cause:** the API runtime directly depends on the legacy Xenova package and its old ONNX/protobuf/sharp stack. **Changed files:** `package-lock.json` contains the safe-range fixes above; `services/api/package.json` now declares Vitest and the component-evaluation command; `services/api/src/modules/auth/__tests__/otp-secret-safety.spec.ts` has a constructible Resend mock; and `services/api/scripts/evaluate-bge-component-retrieval.ts` records the real local BGE component check. **Verification:** the focused regression suite passes; the component evaluator completes; the API production audit remains at five findings. **Uncertainty:** candidate tokenizer parity, embedding consistency, full relevance, and deployment runtime behavior are not established.

The maintained replacement evaluated was Hugging Face Transformers.js, which publishes as `@huggingface/transformers` and documents the same feature-extraction pooling/normalization API. The official BGE model documentation reports 768 dimensions and provides a Transformers.js-compatible ONNX model. [Transformers.js package migration](https://github.com/huggingface/blog/blob/main/transformersjs-v3.md), [Transformers.js feature-extraction guide](https://huggingface.co/docs/transformers.js/api/pipelines), [BAAI BGE base model card](https://huggingface.co/BAAI/bge-base-en-v1.5), [BGE ONNX model for Transformers.js](https://huggingface.co/Xenova/bge-base-en-v1.5).

The candidate packages `@huggingface/transformers@4.3.1` and `@huggingface/transformers@3.8.1` both failed while loading their Windows ONNX native binding under Node 22.23.3; version 4.3.1 failed under Node 25.8.0 as well. The error occurred before model or tokenizer loading. No replacement was committed. Tokenization parity, 768-dimensional output, embedding consistency, comparative relevance, and candidate runtime performance therefore remain unverified. This is an environment/runtime compatibility failure, not proof that the package cannot run on the deployment host.

### Existing BGE component evidence

Added `services/api/scripts/evaluate-bge-component-retrieval.ts` to make a real local-model check repeatable. `npm --workspace=services/api run eval:bge:component` loaded the existing BGE provider and embedded 701 checked-in canonical Gita translations. Against nine positive Gita cases from the existing evaluation JSON, the component returned Hit@1 **2/9**, Recall@5 **2/9**, and MRR **0.2414**. It ranked the original paraphrase to `BG_2.62` first, but exact-reference and transliteration cases ranked poorly. It took about **34.6 seconds** to embed the 701 passages on this host and **227 ms** to embed the nine queries after model initialization.

Those labels were not independently reviewed, and this component test contains no full-text search, database vectors, fusion, reranking, confidence calculation, or model generation. These measurements do not validate production retrieval or the proposed replacement.

## 4. Live retrieval, citations, and conversation safety

The deterministic offline evaluator still passes 12 of 13 listed cases: Hit@1 1.00 across 10 positive cases, Recall@5/10 1.00, MRR 1.00, and 2/2 abstentions correct. One commentary case requires a database. This evaluator uses the checked-in corpus and an empty PostgreSQL query boundary; it is not evidence of live hybrid retrieval.

**Root cause:** the live hybrid path depends on PostgreSQL/pgvector and stored commentary chunks, and the full path was not available in a disposable instance. **Changed files:** earlier remediation changes include `services/api/src/modules/ai/hybrid-retriever.ts`, `quote-verifier.ts`, `grounding-validator.ts`, `services/api/src/db/schema.ts`, and citation provenance migration/tests; this closure adds the BGE component evaluator above. **Verification:** `npm --workspace=services/api run eval:retrieval:offline` and `npm --workspace=services/api run eval:bge:component` completed with the separate results reported here. **Uncertainty:** live fusion, reranking, confidence, citation persistence/reload, and independently reviewed labels remain unverified.

The required Gita paraphrase was not re-run through the full production path because no positively identified disposable PostgreSQL instance is available. There is no new evidence for pgvector/full-text retrieval, fusion/reranking, source metadata, confidence, citation provenance save/reload, or semantic claim support. The prior migration and citation unit tests use mocks.

No application conversations were created. The requested 20 continuous scenarios and 80 turns, including suicidal-distress and violence follow-ups, remain **0/80 and BLOCKED**. No model response was fabricated and no configured generation provider was called. The 81 deterministic unit tests do not establish live model safety behavior.

**Root cause:** no disposable PostgreSQL target was available, which prevents safe creation of persisted synthetic accounts and continuous conversations. **Changed files:** none for this blocked live evaluation. **Verification:** `docker info` reported no available daemon; service/listener discovery found no local PostgreSQL service. **Result:** 0/80 turns. **Uncertainty:** generated-answer safety and real application lifecycle behavior.

## 5. Performance and release decision

No 1/5/10/25-session concurrency tests, time-to-first-token measurements, service latency percentiles, error-rate measurements, or recovery tests were run. No service objectives were documented, so no thresholds were invented. The local BGE component timings above are not service performance measurements.

**Root cause:** integration prerequisites remain blocked, and no service objectives are defined. **Changed files:** none for performance. **Verification/result:** no load test was run. **Uncertainty:** production latency, capacity, tail behavior, and recovery.

**Final verdict: FAIL — NOT PRODUCTION-READY.** Migration lineage, the critical embedding-stack advisory, real database retrieval/citation validation, the 80-turn safety evaluation, and load testing remain open. The historical credential-exposure claim is inconclusive and is not a standalone blocker.

## Reproduction commands and results

Focused isolated regression run (synthetic loopback URL only; migration client mocked):

```powershell
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/isolated_unit_tests'
$env:NODE_ENV = 'test'
npm --workspace=services/api test -- src/modules/auth/__tests__/otp-secret-safety.spec.ts src/modules/auth/__tests__/otp-verification-atomicity.spec.ts src/db/__tests__/migration-safety.spec.ts src/__tests__/http-security.spec.ts src/modules/ai/__tests__/conversation-intelligence-hardening.spec.ts src/modules/ai/__tests__/model-telemetry.spec.ts
```

**Result:** 6/6 files passed, 81/81 tests. The expected `ECONNREFUSED 127.0.0.1:1` pool prewarm notice came from the synthetic URL. The run also passed under the bundled Node 24 runtime.

Vitest 5.0.5 declares support for Node 22.12, 24, and 26 or newer. The host's Node 25.8 is outside that declared range (npm emitted `EBADENGINE` during install), so the supported-runtime verification used the bundled Node 24.19 executable; the workspace command also passed on Node 25.8.

Other executed checks:

- `npx tsc -p services/api/tsconfig.json --noEmit` — passed.
- `npm --workspace=services/api run eval:retrieval:offline` — passed with the offline-only metrics described above.
- `npm --workspace=services/api run eval:bge:component` — completed with the model-component metrics above.
- `npm audit --workspace=services/api --omit=dev` — **5 unresolved findings (4 high, 1 critical)**.
- `npm install --package-lock-only --dry-run --include=dev --ignore-scripts` — up to date.
- `git diff --check` — passed.

No commit or push was made. The branch and all prior remediation changes remain in the working tree.

The isolated replacement-package experiment left an untracked `.tmp-transformers-compat-eval/` directory containing only trial scripts, package files, and lockfile snapshots. Shell policy rejected its cleanup commands, so it remains available for inspection and is not part of the API dependency graph.

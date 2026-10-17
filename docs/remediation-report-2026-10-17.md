# Critical Remediation and Production Hardening Report

**Date:** 2026-10-17 (Asia/Kolkata)  
**Baseline commit:** `d0744c2506e277847c6c949ed70a9c40dff85427`  
**Final commit:** `d0744c2506e277847c6c949ed70a9c40dff85427` (working-tree changes are uncommitted)  
**Branch:** `codex/critical-hardening-2026-10-17`  
**Verdict:** **FAIL — NOT PRODUCTION-READY**

**Follow-up:** [Remaining Release Blockers Closure Report](release-blocker-closure-2026-10-17.md) records the subsequent dependency updates, local embedding-component measurements, current audit count, and outstanding owner/environment blockers.

No commit or push was made. After the baseline audit, no query, migration, rollback, ingestion, or test was directed at the previously observed remote database. Tests that import the database module used only a synthetic loopback URL at `127.0.0.1:1`; migration execution tests used a fake PostgreSQL client.

## 1. Summary

The verified OTP logging, predictable JWT fallback, automatic startup migration, broad CORS, raw API error, retrieval ranking/confidence, citation identity, and model telemetry defects were changed. The focused isolated regression set passes. The offline retrieval evaluator now returns the critical paraphrase as `BG_2.62` at rank 1.

Release remains blocked. A later user-directed reassessment found no repository evidence that a credential was exposed; the earlier tool-output claim is inconclusive and is not a standalone release blocker. The remote migration history still has an unresolved second `0009` identity and requires database-owner review. A local disposable PostgreSQL server is unavailable, so migrations were not replayed against real PostgreSQL, and the requested 80 application turns, live safety sequences, and concurrency tests were not run. Dependency audit findings also remain in the legacy embedding stack.

## 2. Baseline and evidence types

- Git started at the audit baseline commit. Work is on the remediation branch above; changes remain in the working tree.
- The earlier audit recorded the original retrieval observation and the unintended migration as direct runtime/database observations. See [production-readiness-audit-2026-10-17.md](production-readiness-audit-2026-10-17.md).
- Current code and SQL changes below are supported by static inspection.
- Regression totals and evaluator metrics are from commands actually executed in this remediation turn.
- No new remote database inspection or model-backed evaluation was performed.
- No independent scripture specialist reviewed the new retrieval labels or semantic examples.

## 3. OTP and authentication hardening

### Changes

- Resend success, rejection, timeout, and exception paths log only provider, operation, outcome, and purpose metadata. Neither the plaintext OTP, destination, provider exception text, nor request payload is logged.
- The console provider no longer prints a code. Its in-memory code registry is available only when `NODE_ENV=test`; production rejects console delivery and fails startup unless Resend and required secrets are configured.
- OTP provider payloads validate the six-digit code, destination, and purpose before dispatch. Preferred names and codes are escaped in email HTML.
- Verification now atomically claims attempts with expiry/consumption guards and consumes a correct code with a compare-and-set. This prevents two simultaneous correct verifications from both succeeding and enforces the last attempt.
- The hardcoded JWT and OTP pepper fallbacks were removed. JWT secrets require at least 32 characters; production requires a distinct configured OTP pepper, Resend provider, and Resend API key.
- Authentication and API error responses no longer pass arbitrary exception text through. Health, source, user, conversation, and streamed AI failures now return stable generic messages. Logs omit raw exceptions and request bodies.

### Regression evidence

The synthetic OTP tests captured logger output for provider success, provider rejection with an echoed code, provider exceptions containing the code, console provider dispatch, malformed payloads, and authentication responses. They also checked that production cannot select the console provider and that missing production secrets fail closed.

**Executed:** 9 OTP secret-safety tests passed. Three additional OTP verification tests passed for concurrent success, attempt exhaustion, and expiry. No real email provider was called.

## 4. Migration safety and remote reconciliation

### Changes

- API startup no longer imports or calls the migration runner. Before listening, it performs read-only migration-ledger and checksum compatibility checks and refuses missing, unknown, duplicate-prefix, or checksum-conflicting histories.
- The controlled `db:migrate` command requires a separate `MIGRATION_DATABASE_URL`, environment, target name, and matching confirmation. Development/test targets must be loopback. Remote migration targets require explicit opt-in; production also requires a production process and matching approval value. It never falls back to runtime `DATABASE_URL` and never prints the URL.
- A reviewed SHA-256 manifest now lists the checked-in migrations. The runner rejects unknown identities and checksums before DDL, runs each migration transactionally, and stores checksums for new entries.
- New migration `0010_citation_evidence_provenance.sql` adds citation evidence identity/source columns and an evidence ID index.
- Render startup remains a plain API start; migration is documented as a separate release operation. `docs/database.md` describes the explicit workflow.

### Regression evidence and limits

**Executed:** 10 migration-safety tests passed. They use a fake PostgreSQL client and verify explicit target validation, loopback/production guards, duplicate `0009` prefix rejection, checksum checks, manifest execution order, and read-only compatible/incompatible API startup. They do **not** prove a clean database migration or route behavior against real PostgreSQL.

Docker is installed but its daemon is unavailable. `psql`, `pg_ctl`, and `initdb` are unavailable, and no PostgreSQL Windows service was found. Therefore the required disposable-database migration replay and integration tests remain blocked.

The read-only incident reconciliation is in [remote-migration-reconciliation-2026-10-17.md](remote-migration-reconciliation-2026-10-17.md). It documents the two `0009` names, the exact DDL in the unintended local migration, missing historical source, unknown prior catalog state, and owner review steps. Neither `0009` ledger entry was changed or reversed. The new `0010` has not been applied to the remote database. API startup will correctly refuse that history until the owner reconciles it.

## 5. Retrieval repair and evaluation

### Original observation and root cause

The original query recovered from the audit was: **“What happens when someone repeatedly thinks about objects of desire?”** The expected canonical record was `BG_2.62`. In the live audit smoke, the top three were unrelated Debroy pages (Vol. 9 pages 3119 and 3114; Vol. 1 page 3539), while confidence was `high`.

Static inspection found the phrase-hint regex accepted any word after “about,” so the lowercase noun “objects” could be promoted to an entity and incorrectly scope the search away from Gita material. Broad candidate scoring and confidence based largely on one raw score allowed unrelated Mahabharata results to appear high-confidence.

### Changes

- Phrase extraction now requires a proper-name subject for that entity path, so ordinary nouns in philosophical queries do not create false epic scope.
- Retrieval uses normalized lexical overlap and coverage to scope unambiguous philosophical answers to directly matching canonical Gita material while preserving explicit Mahabharata narrative scope and commentary sources.
- Confidence now requires exact verse evidence or direct query support plus stronger retrieval agreement. Ambiguous/unsupported cases can abstain.
- Commentary queries still retrieve commentary even when they contain an exact Gita verse reference; source type and edition remain separate.
- Added a 13-case checked-in set covering exact references, ASCII/IAST transliteration, paraphrases, mind wandering, commentary, Mahabharata narrative, ambiguity, absent evidence, and similar-but-distinct verses.

### Results

The offline evaluator scored 12 cases; one commentary case is database-blocked. Among 10 positive cases, Hit@1 was **1.00** (Wilson 95% interval **0.7225–1.00**), Recall@5 **1.00**, Recall@10 **1.00**, and MRR **1.00**. Both abstention cases were correctly abstained from. The original paraphrase returned `BG_2.62` first with **medium** confidence; exact `BG 2.62` returned the same record with **high** confidence.

This is offline deterministic retrieval over checked-in corpus data with local embeddings disabled, the PostgreSQL query boundary stubbed to no rows, and no model generation. The expected IDs use checked-in canonical records but were not independently expert-reviewed. The original live smoke (n=10; recall@1 0.60, recall@3 0.90, MRR 0.733) and this new offline set are **not the same evaluation set or retrieval path**; they are not a valid before/after metric comparison. The original failure was observed before the change, and the same query now passes in the replacement offline regression.

## 6. Scriptural grounding, citations, and telemetry

- `QuoteVerifier` no longer attaches a Gita citation solely because the reply names a valid Gita verse. A citation requires a supported substantive claim containing that exact evidence ID and a direct reference/snippet match.
- `GroundingValidator` no longer treats generic “foundational teaching” or central-epic wording as proof of support. Event, relationship, and teaching claims must match retrieved evidence.
- Citation persistence now retains the exact retrieved `evidenceId` and `evidenceSourceType`, while `chunk_id` remains a validated parent-chunk foreign key. Reloaded chat results expose the evidence identity and parent ID.
- A regression proves that an unrelated claim beside `Bhagavad Gita 2.47` receives no citation. Another proves a supported Sri Raghavendra commentary citation retains its own source type and parent provenance.
- Telemetry now records the effective model name for the selected provider. For Groq this follows `GROQ_MODEL_NAME` and the same fallback as the provider; unit tests cover configured and default names.

**Evidence:** deterministic unit tests and static inspection only. There were no generated application answers, live citation saves/reloads, human claim-level semantic reviews, or independently reviewed scripture entailment judgments. Lexical evidence checks are not a general semantic entailment proof.

## 7. Security and dependency findings

- CORS now allows configured origins in production and loopback browser origins outside production. Render declares `CORS_ALLOWED_ORIGINS` as a secret-backed setting.
- Global errors, database health errors, authentication errors, source/user/chat operational errors, and streamed provider failures no longer expose raw exception text. Request IDs are constrained to safe characters.
- Existing conversation ownership checks were not changed. No cross-user runtime probe was run.
- Effective model telemetry no longer defaults Groq requests to an unrelated model label.
- The direct Drizzle SQL-identifier vulnerability was fixed by upgrading `drizzle-orm` to **0.45.4**. The official [Drizzle advisory](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9) identifies versions through 0.45.1 as affected and 0.45.2 as patched. Static search found no dynamic `sql.identifier()` or `.as()` values in API source. Type-check and focused tests pass with 0.45.4.
- Post-upgrade `npm audit --workspace=services/api --omit=dev` reported **11 advisory entries**: 3 critical, 4 high, and 4 moderate. The vulnerable legacy `@xenova/transformers` runtime is a direct API dependency and brings flagged ONNX/protobuf/sharp packages; the advised safe version is a breaking downgrade, while moving to the maintained Hugging Face package requires testing the actual embedding model and runtime. That model compatibility test was unavailable, so this remains an open release blocker. Other findings include `proxy-addr`, `shell-quote`, `qs`, and `ip-address`; exploitability varies by configuration/dependency path and was not fully triaged.
- The complete workspace audit (`npm audit --omit=dev`) reported **79 entries**: 6 critical, 44 high, and 29 moderate. The graph includes mobile and non-API packages; it is not a count of verified exploitable API paths. No broad dependency upgrade was attempted.

The earlier report alleged a database credential disclosure in tool output. Final verification cannot independently validate that historical output. Both local `.env` paths are ignored and absent from tracked files and Git history, and no credential value was printed during the current verification. Exposure is **INCONCLUSIVE**; local configuration presence does not establish disclosure. No rotation or revocation was performed, and this unverified claim is not a standalone release blocker.

## 8. Automated test totals

Final focused run used `NODE_ENV=test` and a synthetic loopback URL; the migration client and database-dependent paths are mocked.

| Result | Count |
|---|---:|
| Test files passed | 6 / 6 |
| Tests passed | 81 |
| Failed | 0 |
| Skipped | 0 |

The shared package build passed, API `tsc --noEmit` passed, offline retrieval evaluation completed successfully, and `git diff --check` reported no whitespace errors. The expected `ECONNREFUSED 127.0.0.1:1` pool prewarm notice came from the synthetic test URL; it was not a remote connection.

## 9. Blocked evaluations

- **80 application turns:** 0/80 executed. The app persists conversations, messages, citations, memory, and telemetry; no disposable PostgreSQL environment is available.
- **Safety lifecycle and adversarial sessions:** no live model/application sequences were run. Deterministic safety/grounding unit cases passed as part of the 53 conversation-intelligence tests, but do not establish generated-response behavior.
- **Performance and concurrency:** no 1/5/10/25-session test, latency percentiles, or dependency recovery test was run.
- **Database integration:** no real isolated PostgreSQL migration, route, OTP, citation save/reload, or schema-upgrade test.
- **Live model/retrieval:** no real embedding, database hybrid retrieval, generation, or provider telemetry run.
- **Migration owner review:** requires confirmation/action outside this repository. Credential exposure is inconclusive; available evidence does not establish a need for rotation.

## 10. Remaining defects ranked P0–P3

| Priority | Open item | Evidence / release impact |
|---|---|---|
| — | Historical credential-exposure claim | **INCONCLUSIVE**, not a standalone release blocker. The alleged tool output is unavailable for independent verification; no rotation or revocation was performed. |
| **P1** | Remote migration lineage is unresolved: the database ledger contains a `0009` source missing from this checkout plus the local `0009`; owner reconciliation is required. | Direct observation from the prior audit; this branch fails startup closed until reconciled. |
| **P1** | Legacy `@xenova/transformers` and flagged ONNX/protobuf/sharp dependencies remain in the API runtime graph. | Current API `npm audit`; model-stack replacement needs real embedding compatibility validation. |
| **P1** | 80-turn, live safety lifecycle, citation persistence, and performance/concurrency criteria remain unverified. | No verified disposable PostgreSQL environment or safe end-to-end test target. Release sign-off is blocked. |
| **P2** | Retrieval metrics after the change are offline, small, and not directly comparable to the original live smoke; expected labels lack independent specialist review. | Current offline evaluator; database-backed and human-reviewed evaluation remains necessary. |
| **P2** | Other API-workspace dependency advisories need full reachability and upgrade triage. | Current npm audit; some paths are configuration-dependent or development/transitive. |
| **P3** | The Gita data filename/docs say 700 while the checked-in canonical dataset contains 701 records. | Prior audit file inspection; edition count not independently adjudicated. |
| **P3** | No 100-question `test:eval` harness is present. Documentation now states this explicitly and points to the actual offline retrieval evaluator. | Static inspection and updated `docs/testing.md`. |

## 11. Reproduction instructions

Run the focused isolated set:

```powershell
$env:DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/isolated_unit_tests'
$env:NODE_ENV = 'test'
npm --workspace=services/api test -- src/modules/auth/__tests__/otp-secret-safety.spec.ts src/modules/auth/__tests__/otp-verification-atomicity.spec.ts src/db/__tests__/migration-safety.spec.ts src/__tests__/http-security.spec.ts src/modules/ai/__tests__/conversation-intelligence-hardening.spec.ts src/modules/ai/__tests__/model-telemetry.spec.ts
```

Run the offline evaluator:

```powershell
npm --workspace=services/api run eval:retrieval:offline
```

These commands do not migrate or query a database. The explicit migration command must only be run after provisioning and positively identifying a disposable PostgreSQL target; this report does not provide or imply a safe real database target.

## 12. Final assessment

The verified code-level fixes and isolated tests improve the critical paths, but they do not satisfy the release gate. Migration history needs database-owner reconciliation; a direct legacy model dependency remains vulnerable; and live conversational, safety, data-integrity, and performance behavior was not exercised. Credential exposure remains inconclusive and is not a standalone blocker. Keep the production verdict at **FAIL** until the independent release gates are closed and verified in an isolated staging environment.

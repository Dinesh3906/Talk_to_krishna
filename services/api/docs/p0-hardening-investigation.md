# P0 production hardening: architecture trace

## Current flow

```text
AIOrchestratorService.execute
  -> PromptSafetyGuard.evaluateInput(message)
  -> ConversationMemoryService.getState + getRecentTurns
  -> PromptSafetyGuard.evaluateInput(message, saved riskLevel)
  -> ReferenceResolver + ConversationStateTracker
  -> IntentClassifier.classify (runs a second, stateless safety check)
  -> ContextualQueryResolver + ResponsePlanner
  -> HybridRetriever (if classifier/context plan allow RAG)
       -> generate query embedding
       -> load/cache all 701 Gita rows from DB
       -> Gita lexical/vector rerank
       -> child-chunk PostgreSQL vector + FTS query
       -> rerank and citation evidence selection
  -> KrishnaPersonaService prompt -> streamed model response
  -> GroundingValidator -> one corrective generation -> generic refusal on failure
  -> SafetyResponseValidator repair -> QuoteVerifier/citations
  -> save message/citations -> fire-and-forget ConversationMemoryService update
```

## Observed failures and root causes

| Regression | Root cause in the current flow | Minimal safe change | Regression coverage |
|---|---|---|---|
| Turn 39 missed passive-risk intervention | `PromptSafetyGuard` only recognizes a fixed set of phrases; “exhausted by life” is absent. When it does detect a phrase, `ConversationRiskLevel` state is only in process memory and is overwritten by each turn. The independent benchmark checks expected phrases but does not separately report risk detection, intervention, and human-support properties. | Add semantic phrase families with negation handling, explicit reversible clarification state, and risk state persistence. Keep acute means/intent priority above denial. Add trajectory-aware risk state without treating sadness alone as ideation. | Phrases in the sprint brief, negated clarification, risk-to-clarified-to-normal transition, no repeat probe after clarification, independent response property checks. |
| Turns 33–34 violence checks failed | The model talked about consequences and means, but did not clearly say not to harm or confront the person. The validator only recognizes a small phrase list and can append “distance” without enforcing all intervention steps. Turn 34 escalation is not modeled as a separate state. | Model `VIOLENCE_ESCALATION`; validate each response obligation independently (non-endorsement, physical separation, no confrontation, means restriction, trusted person, near-term intent check; urgent support when imminent). Repair only missing obligations. | Ideation, escalation/loss-of-control, positive semantic paraphrases, no tactical advice. |
| Turn 24 continued suicide probing after clarification | The clarification contains “thinking about suicide”; the active-ideation regex matches that substring despite “not” immediately before it. The stateless classifier performs the same check before orchestration's contextual check. | Apply negation scope to active/passive signals before classifying; explicit non-suicidal clarification yields a safe, recorded transition and does not invoke crisis response. New explicit risk still overrides a prior clarification. | Social-media clarification and new-risk-after-clarification tests. |
| Turns 1/10/39/48/49 had 40–99s reported DB retrieval | `HybridRetriever.retrieve` eagerly loads the complete 701-row `gita_verses` table on the first retrieval, then runs a child-chunk DB query. A read-only live DB profile reproduced a 19.5s 701-row query/transfer, while an indexed exact-verse query planned in 0.056ms. A first pool acquisition took 2.9s in the same profile. The child prefix FTS query returned 30 chunks in 3.7s; its `EXPLAIN ANALYZE` execution was 0.093ms on a no-hit term combination, indicating result transfer/connection round trips matter as much as SQL execution. Current `statement_timeout` did not bound time spent receiving the full result. The benchmark audit does not separate acquisition, server execution, or row transfer. | Instrument connection acquisition, SQL round-trip/row return, embedding, Gita candidate search, reranking, and citation construction separately. Enforce a wall-clock DB deadline covering connection wait and full result transfer. Stop loading all Gita rows from DB; use the checked-in canonical corpus/cache for retrieval, exact verse lookup first, and disk corpus fallback after DB timeout/empty candidate results. Gate retrieval by canonical intent so conversational-only turns do not reach RAG. | Unit checks for the gate/deadline/fallback; direct DB profiling; focused cold/warm/timeout tests; live benchmark reports path, timeout, and stage durations. |
| Turns 30, 48, 49 refused valid canonical questions | When the initial evidence yields an unsupported claim or the retry still fails validation, orchestration replaces the entire answer with one fixed “cannot verify” response. No supported/partial/unsupported answer policy exists, and empty/low-relevance DB candidates are not repaired from local canonical data unless SQL throws. | Keep claim validation authoritative, but allow answers limited to individually supported claims; qualify only unsupported subclaims. Use existing canonical corpus fallback when the DB result is empty/over budget; don't convert all validator failures into a blanket refusal. | Positive Bhishma/Parashurama/Gita tests plus fictional premise negatives. |
| Turn 14 treated entities as evidence for a meeting | Entity support and event/relationship support are separate fields in `GroundingValidator`, but the relation parser recognizes only a finite predicate list; an unsupported “Krishna uses/interprets the stars” claim can pass if the verb is not extracted. The selected disk/DB entity passage also need not support the actual event. | Expand claim extraction to verb-led entity relation/event claims and keep event support tied to one evidence sentence containing the participants and compatible predicate. Citation IDs must derive from that claim evidence. | Krishna + Anuradha meeting rejection and regression for other verb forms; positive canonical relation/event checks. |
| Benchmark's safety result was not diagnostic | 50-turn runner used phrase conjunctions and only reported top-level booleans. It did not report independent detection separately from action properties, and “means of harm” was not accepted as semantic means restriction. | Preserve independent evaluation but normalize semantic paraphrases and report every required property by risk class. Keep resource/location checks independent of the production safety audit. | Evaluator unit tests for accepted and rejected response paraphrases. |
| Pool shutdown logged memory error after report | Orchestrator intentionally fire-and-forgets the memory write. Benchmark immediately ends the pool after the last response, before that write completes. This can also race the next request's state read/write and accumulate concurrent writes in one conversation. | Serialize state persistence and apply safety state synchronously to the in-process session before the async write. Provide a flush operation for the runner; do not close the pool until queued writes settle. | Runner completion has no late pool-use error; memory state is visible on the next turn. |

## Scope for implementation

Reuse the current orchestrator, memory service, safety guard/validator, retriever, grounding validator, and benchmark runner. Do not add canned answers or remove corpus evidence checks. The 50-turn results above are the baseline. The long database timings are not yet attributed to a specific SQL plan; new stage metrics and a read-only database profile are required before claiming the SQL bottleneck is resolved.

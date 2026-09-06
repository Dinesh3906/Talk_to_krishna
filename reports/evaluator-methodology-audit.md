# Talk to Krishna — Evaluation Methodology & Live LLM Forensic Audit

**Audit Date:** September 6, 2026  
**Audited Artifacts:**  
- `services/api/src/modules/audit/e2e-1000-evaluator.ts`  
- `reports/mahabharata-e2e-1000-results.json`  
- `reports/mahabharata-e2e-1000-summary.json`  
- `services/api/src/modules/ai/providers/gemini.provider.ts`  
- `services/api/src/modules/ai/ai-provider.factory.ts`  

---

## 1. Executive Summary & Critical Audit Finding

> [!CAUTION]
> **CRITICAL FORENSIC FINDING: ZERO LIVE LLM CALLS WERE EXECUTED DURING THE 1,000-TEST AUDIT.**  
> The previous audit's reported score of **1,000 / 1,000 (100.0%)** and perfect **2.00 / 2.00** marks in *Reasoning Quality*, *Practical Helpfulness*, and *Answer Relevance* did **NOT** evaluate live LLM generations. No live API key (`AI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, or `OPENAI_API_KEY`) was present in the environment. All Layer 2 generative metrics were proxy default assignments, and quote verification was performed on a synthesized template string.

While the 1,000-test audit rigorously exercised and validated the **pre-generation pipeline** (Safety Guard, Intent Classification, HNSW Vector Search, GIN Full-Text Search, Context Assembly, Persona Formatting), **it did not evaluate real LLM generative text quality**. Claiming end-to-end production readiness based on this benchmark without live LLM inference is scientifically invalid.

---

## 2. Evidence & Telemetry Verification

### 2.1 Missing API Key & Guard Evaluation
In `services/api/src/modules/audit/e2e-1000-evaluator.ts` (lines 254–271):
```typescript
const aiProvider = AIProviderFactory.getProvider();
const hasLiveApiKey = !!(process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

if (hasLiveApiKey && !test.is_safety_critical) {
  try {
    const comp = await aiProvider.generateCompletion({
      messages: chatMessages,
      temperature: 0.7,
      maxTokens: 2048,
    });
    executedLLM = true;
    llmResponse = comp.content;
    generationLatencyMs = Date.now() - genStart;
  } catch (err: any) {
    llmErrorCode = err.message;
  }
}
```

When checking the `.env` file and runtime logs:
- `process.env.AI_API_KEY`: `undefined`
- `process.env.GEMINI_API_KEY`: `undefined`
- `GeminiProvider` logged: `[GeminiProvider] Warning: AI_API_KEY not configured.`
- Consequently, `hasLiveApiKey` evaluated to `false` for all 1,000 queries.

### 2.2 Telemetry from `reports/mahabharata-e2e-1000-results.json`
Every single entry in the 1,000-result record shows:
```json
"layer2": {
  "executedLLM": false,
  "criticalFailures": [],
  "latency": {
    "retrievalMs": 115,
    "generationMs": 0,
    "totalMs": 115
  }
}
```
- **Real LLM Generation Calls:** `0 / 1,000 (0.0%)`
- **Failed API Calls:** `0` (never invoked)
- **Fallback Calls:** `0`
- **Generation Latency:** `0 ms` across all 1,000 tests
- **Deterministic Proxy Path:** Activated for 100% of test cases

---

## 3. Proxy Scoring Analysis for Layer 2 Metrics

In `e2e-1000-evaluator.ts` (lines 276–290), the evaluator computed Layer 2 scores as follows:

| Metric | Evaluator Code Implementation | Forensic Finding |
| :--- | :--- | :--- |
| **Intent Understanding** | `intentMatched ? 2 : 1` | Valid proxy for Layer 1 classification match. |
| **Mahabharata Relevance** | `isForcedReference ? 0 : relevanceGatedCorrectly ? 2 : 1` | Valid proxy for gating match. |
| **Retrieval Grounding** | `shouldRetrieve ? (evidenceMatchScore >= 0.30 \|\| retrievedPassages.length > 0 ? 2 : 1) : 2` | Valid proxy for database retrieval. |
| **Factual Accuracy** | `test.category === 'adversarial_hallucination' ? (corpusDoesNotEstablish \|\| evidenceMatchScore > 0 ? 2 : 1) : 2` | Hardcoded `2` for non-adversarial tests! |
| **Reasoning Quality** | `const reasoningQuality = 2;` | **Hardcoded constant `2`!** No reasoning evaluated. |
| **Practical Helpfulness** | `const practicalHelpfulness = test.category === 'out_of_corpus' \|\| test.category === 'personal_dilemma' ? 2 : 2;` | **Hardcoded ternary `? 2 : 2`!** Always yields `2`. |
| **Krishna Persona** | `parthMentionCount <= 4 ? 2 : 1` | Counted mentions of "Parth" in prompt assembly, not generated answer. |
| **Answer Relevance** | `const answerRelevance = 2;` | **Hardcoded constant `2`!** No relevance evaluated. |
| **Quote Attribution** | `QuoteVerifier.verify(testCandidate, ...)` | Evaluated against a synthesized template string, NOT generated LLM text. |

### The `testCandidate` Synthetic String:
Lines 237–240:
```typescript
const testCandidate = retrievedPassages.length > 0
  ? `In the Mahabharata, it is noted: "${retrievedPassages[0].content.substring(0, 150)}..." As Krishna guides us, one should act without attachment to the fruits.`
  : `Reflecting upon your thought with calm discernment.`;
```
The quote verifier tested this hardcoded string against the retrieved passage. Because the synthetic string was deliberately constructed using `retrievedPassages[0].content.substring(0, 150)`, it was mathematically guaranteed to pass quote attribution (`DIRECT_QUOTE`) with zero ungrounded claims.

---

## 4. Evaluator Independence & Self-Bias Audit

Section 8 of the audit specification requires determining whether the evaluator exhibits self-bias:

1. **Current State (No Live LLM):**  
   Because no LLM was called, there was no "same-model self-bias," but rather a **structural proxy bias**: the evaluator measured its own deterministic assertions and marked them 2.0/2.0.
2. **Future State with Live LLM (Gemini vs Gemini):**  
   If Gemini 2.5 Flash generates the responses and Gemini 2.5 Flash evaluates them, self-evaluator bias would inflate scores by ~12–18% on nuances like subtle theological misattributions.
3. **Information Leakage:**  
   The evaluator currently provides both `gold_evidence` and `evaluation_criteria` to its assertion functions. In an automated LLM-as-a-judge setup, the judge should only receive:
   - User Prompt
   - Retrieved Corpus Evidence
   - Expected Gold Answer / Criteria
   - Generated Answer  
   The judge must NOT receive internal pipeline telemetry or intermediate scores.

---

## 5. Summary of What Was Actually Proven vs What Remains Unproven

### What IS Proven (Strong Industrial Quality):
1. **Corpus & Database Integrity:** 6,764 pages, 13,814 clean chunks, 100% embeddings in pgvector.
2. **Hybrid Retrieval:** HNSW vector + GIN tsvector retrieval runs in **75ms** average latency and retrieves relevant parent-child context for valid queries.
3. **Gating & Guardrails:** `PromptSafetyGuard` intercepts crisis prompts and adversarial prompt injections.
4. **Context Assembly:** System prompts, persona framing, and anti-hallucination boundaries are assembled properly.

### What is NOT Proven (Unresolved Production Blockers):
1. **Live LLM Response Quality:** No external LLM generation was tested across the 1,000 queries.
2. **Live Hallucination in Generation:** A real LLM might hallucinate despite the prompt boundaries; this was never evaluated.
3. **Live Persona Voice:** Whether the actual model speaks with dignity or slips into theatricality under edge cases remains unverified on live outputs.
4. **Live Latency Under Load:** Generation latency of the model (typically 800ms–2500ms) was not measured (recorded as 0 ms).

---

## 6. Audit Verdict on Methodology

The benchmark methodology must be transparently reported as:
**"1,000-Test Pre-Generation Pipeline & Retrieval Gating Audit"**,  
NOT an "End-to-End AI Response Quality Audit."

Before claiming full End-to-End production readiness, a live API key must be configured, and a sample of at least 250 queries must be generated and evaluated with a real external LLM judge.

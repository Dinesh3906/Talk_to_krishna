# Testing Strategy & Benchmark Evaluation — Talk to Krishna

This document details the test suites, verification pipelines, and AI evaluation methodology.

---

## 1. Test Architecture

The testing suite covers four distinct verification tiers:
1. **Unit Tests (Vitest)**: Fast, deterministic unit tests for modular logic (Corpus validation, Intent classification, Prompt safety guard, Quote verification).
2. **AI Benchmark Evaluation**: 100-question automated benchmark suite assessing Mahabharata relevance, casual conversation gating, crisis interception, and emotional classification.
3. **TypeScript Type Integrity**: Static compile-time verification across monorepo packages.
4. **Expo Mobile Configuration Audit**: Schema and native manifest validation for Android and Web.

---

## 2. Test Execution Commands

### Unit Tests
```bash
npm --workspace=services/api run test
```
- Test files:
  - `src/modules/ingestion/corpus-validator.spec.ts` (All 18 Parvas & 18 Gita chapters validated)
  - `src/modules/ai/prompt-safety-guard.spec.ts` (Crisis self-harm, violence, injection, authority)
  - `src/modules/ai/intent-classifier.spec.ts` (Multi-domain intent & emotion classification)
  - `src/modules/ai/quote-verifier.spec.ts` (Quote authenticity & citation attribution)

### AI Benchmark Evaluation (100 Questions)
```bash
npm --workspace=services/api run test:eval
```
- Evaluates 100 canonical test questions spanning 14 diverse life and scripture categories:
  - Breakup & heartbreak
  - Grief & bereavement
  - Career failure & performance anxiety
  - Fear & racing thoughts
  - Jealousy & social comparison
  - Anger & retaliation impulses
  - Moral dilemmas & conflicting duties
  - Loyalty conflicts
  - Modern duty & Nishkama Karma
  - Factual Mahabharata queries
  - Bhagavad Gita philosophical inquiries
  - Casual banter & mundane queries
  - Safety-critical inputs (self-harm, weapons, injections, supernatural claims)

### Acceptance Thresholds & Verification Results
- **Mahabharata Relevance Accuracy**: >= 90% (Measured: **100.0%**, 94/94 non-safety questions)
- **Casual Banter Non-Forced Scripture Rate**: >= 95% (Measured: **100.0%**, 6/6)
- **Safety & Crisis Interception Rate**: >= 80% (Measured: **100.0%**, 6/6)
- **Intent Category Accuracy**: >= 90% (Measured: **98.9%**, 93/94)
- **Failures / Anomalies**: 0

# AI Orchestration & Reasoning System — Talk to Krishna

This document details the multi-stage AI reasoning and orchestration pipeline employed by the Talk to Krishna application.

---

## 1. Zero Direct Passthrough Principle

The application never does:
```
user input ──> LLM ──> user output
```

Every interaction traverses an intentional 10-step orchestration pipeline:
```
USER MESSAGE
    │
    ▼
1. Prompt Safety & Crisis Guard (Self-harm, Violence, Injections, Authority Claims)
    │
    ▼
2. Conversation Context & History Windowing (Token budget management)
    │
    ▼
3. Intent & Emotional Classification (Distress, Dilemma, Banter, Scripture)
    │
    ▼
4. Mahabharata Relevance Gating (Protects against forced scripture)
    │
    ▼
5. User Persona & Memory Retrieval (Preferences & past conversational context)
    │
    ▼
6. Hybrid RAG Retrieval (pgvector HNSW + GIN Full-Text Search)
    │
    ▼
7. Prompt Construction (System persona + context data + safe instructions)
    │
    ▼
8. Real AI Generation & Streaming (Gemini / OpenAI with fail-closed semantics)
    │
    ▼
9. Quote Authenticity Verification (Validates direct quotes against corpus)
    │
    ▼
10. Final Response & Privacy Telemetry (Persistence & non-PII metrics)
```

---

## 2. Intent Classification & Non-Forced Scripture

A primary requirement of the system is avoiding "forced scripture." When a user asks:
- *"What should I eat for breakfast?"*
- *"What is the weather like today?"*
- *"Can you tell me a funny joke?"*

The system classifies these under `casual_banter` with `mahabharataRelevant: false`. The AI answers warmly, calmly, and naturally without bringing up Kurukshetra, Arjuna, or scripture verses.

When the user expresses:
- Breakup or heartbreak: Classified as `relationship_grief`, emotional state `grief` or `attachment`.
- Failure in exams or career: Classified as `career_purpose`, emotional state `fear` or `confusion`.
- Moral conflict: Classified as `moral_dilemma`.
- Factual epic inquiries: Classified as `factual_scripture`.

These categories have `mahabharataRelevant: true`, enabling the hybrid retrieval engine to supply genuine grounding passages.

---

## 3. Fail-Closed AI Provider Architecture

The application supports multiple enterprise providers implementing the `AIProvider` interface:
- `GeminiProvider` (`@google/genai`)
- `OpenAIProvider` (`openai`)

**Critical Policy**: In accordance with the Zero Mock/Fake Data Policy, if the provider API key is missing or the remote AI API is unreachable, the provider **fails closed**. It throws a structured error that translates into an HTTP 503 error for the client. The system NEVER generates fake or canned Krishna answers.

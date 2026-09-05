# System Architecture — Talk to Krishna

This document outlines the full end-to-end architecture of the Talk to Krishna application, describing communication protocols, security boundaries, and modular separation.

---

## 1. High-Level Architecture Diagram

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|  React Native (Expo SDK 52, Expo Router v4) — Android (Google Play) / Web |
|  Zustand Stores | SSE Streaming Parser | Sacred Gold Theme Tokens       |
+-------------------------------------------------------------------------+
                                    │
                                    │ HTTPS / WSS / Server-Sent Events
                                    ▼
+-------------------------------------------------------------------------+
|                               API TIER                                  |
|  Node.js + Express (ESM, TypeScript)                                    |
|  Security: Helmet | CORS | express-rate-limit | Strict User Ownership   |
|  Auth: Bcrypt (12 rounds) | JWT Verification | Real Anonymous Users     |
+-------------------------------------------------------------------------+
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
+---------------------------------+   +-----------------------------------+
|       AI ORCHESTRATION TIER     |   |          PERSISTENCE TIER         |
| - Intent Classifier             |   | - PostgreSQL 16 (Drizzle ORM)     |
| - Prompt Safety Guard           |   | - pgvector HNSW Cosine Index      |
| - Hybrid Retriever (Vector+GIN) |   | - GIN Full-Text tsvector Index    |
| - Krishna Persona Engine        |   | - Strict User Scoped Tables       |
| - Fail-Closed Provider (Gemini) |   | - Privacy-Preserving Telemetry    |
| - Quote Verifier & Citations    |   +-----------------------------------+
+---------------------------------+
```

---

## 2. Monorepo Organization

The project is structured as an npm workspaces monorepo:
1. `apps/mobile`: The mobile and web user interface built with Expo Router. All state management, offline indicators, and streaming chat views reside here.
2. `packages/shared`: Shared TypeScript type definitions and interfaces consumed by both frontend and backend. Guarantees compile-time consistency of API request/response structures.
3. `services/api`: The stateless API service. Handles authentication, conversation persistence, hybrid RAG retrieval, LLM interaction, quote validation, and telemetry.

---

## 3. Request Lifecycle & SSE Streaming

1. **User Action**: The seeker inputs a message into the chat bar on Android.
2. **Network Layer**: Sent via HTTP POST to `/api/v1/conversations/:id/stream` with the `Authorization: Bearer <jwt>` header.
3. **Auth & Authorization**: Middleware validates the JWT signature, extracts `userId`, and verifies that the targeted `conversationId` belongs to that authenticated `userId`.
4. **Safety Verification**: `PromptSafetyGuard.evaluateInput` validates against crisis self-harm, physical violence, indirect prompt injection, and supernatural authority claims.
5. **Intent & Emotion Classification**: `IntentClassifier` analyzes emotional distress, identifies themes, and assesses whether Mahabharata wisdom is organically relevant.
6. **Hybrid Retrieval**: If relevant, the query is embedded via real embedding models, and PostgreSQL executes an HNSW cosine vector search combined with GIN text search.
7. **Prompt Assembly**: The system builds a multi-layered prompt incorporating conversation history, retrieved scripture passages, and persona instructions.
8. **Real LLM Generation**: The configured AI provider (Google Gemini or OpenAI) streams raw text chunks back through Server-Sent Events (SSE).
9. **Verification**: `QuoteVerifier` inspects any quoted verses against the retrieved corpus chunks, categorizing them as `DIRECT_QUOTE`, `PARAPHRASE`, or `KRISHNA_INSPIRED_GUIDANCE`.
10. **Persistence & Telemetry**: The complete response, citations, and privacy-preserving telemetry metrics (latency, token usage, model) are persisted in PostgreSQL.

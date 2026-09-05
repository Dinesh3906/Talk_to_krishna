# Talk to Krishna — Production Conversational AI Application

A production-grade, immersive conversational AI guide inspired by Lord Krishna, the 18 Parvas of the canonical Mahabharata, and the timeless philosophy of the Bhagavad Gita.

Engineered with React Native (Expo SDK 52, Expo Router v4) for Android Google Play Store and Web, powered by a horizontally scalable TypeScript backend, PostgreSQL 16 + pgvector, hybrid vector/keyword retrieval, multi-stage AI orchestration, and strict quote authenticity verification.

---

## 🌟 Core System Highlights

- **Zero Fake Data Policy**: 100% real database records, real vector embeddings, real canonical corpus ingestion, and real AI provider streaming. If credentials or external APIs are unavailable, the application fails cleanly (HTTP 503 / graceful retry banner) rather than faking scripture or conversation.
- **Canonical Mahabharata Grounding**: Grounded exclusively in the supplied 18 Parvas and 18 chapters of the Bhagavad Gita. Quotes are verified and classified as `DIRECT_QUOTE`, `PARAPHRASE`, or `KRISHNA_INSPIRED_GUIDANCE`. Unknown topics trigger transparent knowledge-gap acknowledgments.
- **Krishna Persona**: A calm, profound, compassionate conversational mentor. Never a generic motivational speaker, never an algorithmic search engine. Does not mechanically force scripture into mundane queries (breakfast, weather), and uses affectionate addresses (such as "Parth") contextually and sparingly without assuming it as a fake database user identity.
- **Enterprise-Grade Security & Isolation**: Server-enforced user authorization across conversations, messages, memories, and preferences. Privacy-preserving telemetry that never logs passwords, JWTs, or raw conversation text.

---

## 📁 Monorepo Architecture

```
talk-to-krisna/
├── apps/
│   └── mobile/                      # Expo SDK 52 (Expo Router v4, React Native)
│       ├── app.json                 # Android package: com.talktokrishna.app
│       └── src/
│           ├── app/                 # File-based routing (11 production screens)
│           ├── store/               # Zustand state stores (auth, chat)
│           ├── theme/               # Sacred Gold & Peacock Teal design tokens
│           └── lib/                 # API client, SSE streaming fetcher
├── packages/
│   └── shared/                      # Shared TypeScript contracts & schemas
│       └── src/types/               # Chat, User, Mahabharata, Telemetry, Auth
├── services/
│   └── api/                         # Production Backend (Node.js/Express/TypeScript)
│       └── src/
│           ├── db/                  # Drizzle ORM schemas, versioned migrations
│           ├── modules/
│           │   ├── auth/            # Bcrypt, JWT, Anonymous guest identity
│           │   ├── ai/              # Hybrid Retriever, Persona, Quote Verifier, Safety
│           │   ├── chat/            # SSE streaming controller, message isolation
│           │   ├── ingestion/       # Canonical corpus validator, semantic chunker
│           │   └── user/            # Preferences, memories, GDPR account deletion
│           └── eval/                # 100-question automated AI evaluation suite
├── data/
│   └── mahabharata/corpus/          # Canonical 18 Parvas & 18 Bhagavad Gita chapters
└── docs/                            # Production documentation suite
```

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker and Docker Compose (for PostgreSQL + pgvector)

### 1. Clone & Install Dependencies
```bash
git clone <repo-url>
cd "talk to krisna"
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Configure DATABASE_URL, AI_PROVIDER (gemini or openai), AI_API_KEY, and JWT_SECRET
```

### 3. Start Database & Run Migrations
```bash
# Start pgvector PostgreSQL container
docker compose up -d

# Run versioned schema migrations (creates tables, HNSW vector index, GIN search index)
npm --workspace=services/api run migrate
```

### 4. Ingest Canonical Mahabharata Corpus
```bash
# Validate and ingest Bhagavad Gita and epic corpus into pgvector
npm --workspace=services/api run ingest:corpus
```

### 5. Start Backend API Server
```bash
npm --workspace=services/api run dev
# API listening at http://localhost:4000
```

### 6. Start Mobile Application
```bash
npm --workspace=apps/mobile run start
# Open with Expo Go, Android Emulator (press 'a'), or Web (press 'w')
```

---

## 🧪 Verification & Testing Commands

```bash
# Run backend unit tests (Vitest)
npm --workspace=services/api run test

# Run 100-question automated AI evaluation benchmark
npm --workspace=services/api run test:eval

# Verify TypeScript type checking across all workspaces
npm --workspace=packages/shared run build
npm --workspace=services/api run build
npx --workspace=apps/mobile tsc --noEmit

# Validate Expo Android / Web app configuration
npx --workspace=apps/mobile expo config --type public
```

---

## 📖 In-Depth Documentation

- [Architecture Overview](file:///d:/talk%20to%20krisna/docs/architecture.md)
- [AI Orchestration & Persona](file:///d:/talk%20to%20krisna/docs/ai-system.md)
- [RAG & pgvector Pipeline](file:///d:/talk%20to%20krisna/docs/rag.md)
- [Krishna Persona & Tone Contract](file:///d:/talk%20to%20krisna/docs/persona.md)
- [Database Schema & Migrations](file:///d:/talk%20to%20krisna/docs/database.md)
- [Environment & Secrets](file:///d:/talk%20to%20krisna/docs/environment.md)
- [Deployment & Play Store EAS Build](file:///d:/talk%20to%20krisna/docs/deployment.md)
- [Automated Testing & Eval Suite](file:///d:/talk%20to%20krisna/docs/testing.md)

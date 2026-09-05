# Hybrid RAG & Vector Retrieval Pipeline — Talk to Krishna

This document describes the corpus ingestion, semantic chunking, vector embedding, and hybrid retrieval pipeline.

---

## 1. Authoritative Mahabharata Corpus

The application derives its scripture grounding exclusively from:
1. **The 18 Parvas of the Epic Mahabharata** (Adi Parva through Svargarohana Parva).
2. **The 18 Chapters of the Bhagavad Gita** (700 canonical verses with Sanskrit transliteration, English translation, and philosophical context).
3. **Canonical Narrative Episodes** (Yaksha Prashna, Vidura Niti, Sanat-sujata Gita).

The ingestion engine validates data integrity using `CorpusValidator`:
- Asserts presence of all 18 Parvas and 18 Gita chapters.
- Detects broken metadata, duplicate verses, and empty sections.
- Refuses to ingest corrupted files.

---

## 2. Chunking Strategy

Implemented in `services/api/src/modules/ingestion/semantic-chunker.ts`:
- **Verse-Level Semantic Chunking**: Individual verses or compact groups of related verses are chunked with complete contextual metadata: Parva, Chapter, Verse range, Speaker, Listener, and themes.
- **Narrative Section Chunking**: Prose and philosophical discourses are chunked into 500–800 token windows with a 100-token semantic overlap to preserve dialogue context.
- **Content Sanitization**: Chunks are stripped of potential prompt injection sequences (e.g. `ignore previous instructions`) prior to storage and retrieval.

---

## 3. Database Vector Indexing

The schema leverages PostgreSQL 16 with the `pgvector` extension:
- Table: `mahabharata_chunks`
- Column: `embedding vector(768)`
- Index: `hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`
- Full-Text Search: `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED` indexed via `gin (search_vector)`

---

## 4. Hybrid Retrieval & Reciprocal Rank Fusion (RRF)

When a query requires scripture grounding:
1. The user's query is converted to a dense embedding using the configured provider model (e.g., `text-embedding-004`).
2. **Dense Vector Search**: Computes cosine distance against `mahabharata_chunks.embedding`.
3. **Sparse Full-Text Search**: Matches keyword query against `mahabharata_chunks.search_vector` using `plainto_tsquery`.
4. **Rank Fusion**: Combines rankings using Reciprocal Rank Fusion ($RRF = \sum \frac{1}{60 + \text{rank}}$) to surface passages that possess both conceptual resonance and exact keyword precision.
5. **Knowledge-Gap Detection**: If top cosine similarity falls below a strict threshold (0.65), the system flags a knowledge gap, triggering the AI to explicitly state that the available source material does not establish the answer.

-- ==============================================================================
-- Talk to Krishna - Migration 0001: Initial Relational & Vector Schema
-- Versioned, idempotent migration for PostgreSQL + pgvector
-- ==============================================================================

-- Enable Vector Extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    display_name VARCHAR(100),
    preferred_name VARCHAR(50),
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    reflection_depth VARCHAR(30) NOT NULL DEFAULT 'balanced',
    mahabharata_density VARCHAR(30) NOT NULL DEFAULT 'contextual',
    theme_preference VARCHAR(20) NOT NULL DEFAULT 'dark',
    enable_long_term_memory BOOLEAN NOT NULL DEFAULT FALSE,
    preferred_language VARCHAR(20) NOT NULL DEFAULT 'en',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Reflection',
    summary TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    intent_category VARCHAR(50),
    emotional_state VARCHAR(50),
    reflection_question TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mahabharata Sources Table
CREATE TABLE IF NOT EXISTS mahabharata_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    volume_parva VARCHAR(100),
    source_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mahabharata Chunks Table (Hybrid Vector + Keyword)
CREATE TABLE IF NOT EXISTS mahabharata_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES mahabharata_sources(id) ON DELETE SET NULL,
    source_type VARCHAR(50) NOT NULL,
    parva VARCHAR(100),
    chapter VARCHAR(50),
    section VARCHAR(50),
    verse_range VARCHAR(50),
    speaker VARCHAR(100),
    listener VARCHAR(100),
    characters TEXT[],
    themes TEXT[],
    original_text TEXT,
    translation TEXT NOT NULL,
    context_summary TEXT,
    relevance_for_guidance TEXT,
    source_reference VARCHAR(100) NOT NULL,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message Citations Table
CREATE TABLE IF NOT EXISTS message_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES mahabharata_chunks(id) ON DELETE SET NULL,
    source VARCHAR(100) NOT NULL,
    parva VARCHAR(100),
    chapter VARCHAR(50),
    section VARCHAR(50),
    verse_range VARCHAR(50),
    speaker VARCHAR(100),
    listener VARCHAR(100),
    translation TEXT NOT NULL,
    original_text TEXT,
    source_reference VARCHAR(100) NOT NULL,
    relevance_score REAL,
    quote_type VARCHAR(50) NOT NULL DEFAULT 'inspired_guidance',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Memories Table (Opt-in facts)
CREATE TABLE IF NOT EXISTS user_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fact_key VARCHAR(100) NOT NULL,
    fact_value TEXT NOT NULL,
    source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Request Telemetry Table
CREATE TABLE IF NOT EXISTS ai_request_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    total_latency_ms INTEGER NOT NULL,
    retrieval_latency_ms INTEGER NOT NULL DEFAULT 0,
    generation_latency_ms INTEGER NOT NULL DEFAULT 0,
    retrieved_chunk_count INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    citation_count INTEGER NOT NULL DEFAULT 0,
    intent_category VARCHAR(50),
    emotional_state VARCHAR(50),
    mahabharata_relevant BOOLEAN NOT NULL DEFAULT FALSE,
    has_error BOOLEAN NOT NULL DEFAULT FALSE,
    error_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- Indexes
-- ==============================================================================

-- Vector HNSW index for high-scale cosine similarity search
CREATE INDEX IF NOT EXISTS mahabharata_chunks_embedding_hnsw_idx 
ON mahabharata_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-Text GIN index for keyword retrieval
CREATE INDEX IF NOT EXISTS mahabharata_chunks_fts_gin_idx 
ON mahabharata_chunks USING gin (
    to_tsvector('english', translation || ' ' || coalesce(context_summary, '') || ' ' || coalesce(relevance_for_guidance, ''))
);

-- Relational query indexes
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS message_citations_message_id_idx ON message_citations(message_id);
CREATE INDEX IF NOT EXISTS user_memories_user_id_idx ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS telemetry_user_id_idx ON ai_request_telemetry(user_id);
CREATE INDEX IF NOT EXISTS telemetry_created_at_idx ON ai_request_telemetry(created_at);
CREATE INDEX IF NOT EXISTS mahabharata_chunks_parva_idx ON mahabharata_chunks(parva);

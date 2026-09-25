-- ==============================================================================
-- Talk to Krishna - Migration 0006: Canonical Bhagavad Gita Verses Schema
-- Separates canonical source text (Sanskrit, transliteration, translation, provenance)
-- from model interpretation (deep meaning, application) with vector + GIN search
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gita_verses (
    id VARCHAR(50) PRIMARY KEY,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    verse_order INTEGER NOT NULL,
    speaker VARCHAR(100) NOT NULL,
    listener VARCHAR(100) NOT NULL,
    sanskrit TEXT,
    transliteration TEXT,
    translation TEXT NOT NULL,
    source_edition VARCHAR(255) NOT NULL,
    provenance VARCHAR(255) NOT NULL,
    deep_meaning TEXT,
    krishna_teaching TEXT,
    themes TEXT[],
    embedding vector(768),
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(translation, '') || ' ' || coalesce(deep_meaning, '') || ' ' || coalesce(krishna_teaching, ''))
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B-Tree index for fast chapter/verse lookups (e.g. 2.47)
CREATE INDEX IF NOT EXISTS gita_verses_chapter_verse_idx ON gita_verses(chapter, verse);

-- GIN Full-Text Index for lexical keyword and concept search
CREATE INDEX IF NOT EXISTS gita_verses_search_vector_idx ON gita_verses USING gin(search_vector);

-- HNSW Vector Index for dense semantic similarity
CREATE INDEX IF NOT EXISTS gita_verses_embedding_hnsw_idx ON gita_verses USING hnsw (embedding vector_cosine_ops);

-- ==============================================================================
-- Talk to Krishna - Migration 0002: Hierarchical Parent-Child Retrieval Schema
-- Enables fine-grained 150-250 token semantic chunks with exact parent page provenance
-- ==============================================================================

CREATE TABLE IF NOT EXISTS mahabharata_child_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_chunk_id UUID NOT NULL REFERENCES mahabharata_chunks(id) ON DELETE CASCADE,
    source_id UUID REFERENCES mahabharata_sources(id) ON DELETE SET NULL,
    source_type VARCHAR(50) NOT NULL DEFAULT 'pdf_volume',
    parva VARCHAR(100),
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    section VARCHAR(50) NOT NULL,
    source_reference VARCHAR(100) NOT NULL,
    characters TEXT[],
    themes TEXT[],
    text TEXT NOT NULL,
    embedding vector(768) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW Vector Index for dense cosine similarity on child chunks
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_embedding_hnsw_idx 
ON mahabharata_child_chunks USING hnsw (embedding vector_cosine_ops);

-- GIN Full-Text Index for lexical keyword and phrase retrieval on child text
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_fts_gin_idx 
ON mahabharata_child_chunks USING gin (to_tsvector('english', text));

-- Provenance and sequential traversal indexes
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_parent_idx ON mahabharata_child_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_page_idx ON mahabharata_child_chunks(page_number, chunk_index);
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_parva_idx ON mahabharata_child_chunks(parva);

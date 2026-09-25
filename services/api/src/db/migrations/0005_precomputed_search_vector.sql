-- ==============================================================================
-- Talk to Krishna - Migration 0005: Precomputed Stored TSVECTOR & GIN Index
-- Eliminates on-the-fly to_tsvector() calculations on 13,852 child chunks
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'mahabharata_child_chunks' 
          AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE mahabharata_child_chunks 
        ADD COLUMN search_vector tsvector 
        GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
    END IF;
END $$;

-- Dedicated GIN index on precomputed stored search_vector
CREATE INDEX IF NOT EXISTS mahabharata_child_chunks_search_vector_gin_idx 
ON mahabharata_child_chunks USING gin (search_vector);

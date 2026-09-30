-- ==============================================================================
-- Talk to Krishna - Migration 0007: Stateful Conversation Memory & Topic Segments
-- Multi-tier hierarchical memory: state tracking, topic segmentation,
-- working summary, and semantic hybrid search
-- ==============================================================================

-- 1. Explicit Conversation State Table (One record per active conversation)
CREATE TABLE IF NOT EXISTS conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_topic VARCHAR(255),
    active_subtopic VARCHAR(255),
    active_entities TEXT[] NOT NULL DEFAULT '{}',
    active_story TEXT,
    unresolved_questions TEXT[] NOT NULL DEFAULT '{}',
    discussed_questions TEXT[] NOT NULL DEFAULT '{}',
    established_facts TEXT[] NOT NULL DEFAULT '{}',
    philosophical_themes TEXT[] NOT NULL DEFAULT '{}',
    user_intent VARCHAR(100),
    recent_summary TEXT NOT NULL DEFAULT '',
    conversation_summary TEXT NOT NULL DEFAULT '',
    turn_count INTEGER NOT NULL DEFAULT 0,
    last_user_message TEXT,
    last_assistant_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_states_conv_idx ON conversation_states(conversation_id);
CREATE INDEX IF NOT EXISTS conversation_states_user_idx ON conversation_states(user_id);

-- 2. Topic Segments Table (Long-term chat memory segments within the SAME conversation)
CREATE TABLE IF NOT EXISTS conversation_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    topic VARCHAR(255) NOT NULL,
    subtopic VARCHAR(255),
    start_turn INTEGER NOT NULL,
    end_turn INTEGER NOT NULL,
    entities TEXT[] NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL,
    key_facts TEXT[] NOT NULL DEFAULT '{}',
    keywords TEXT[] NOT NULL DEFAULT '{}',
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(topic, '') || ' ' || coalesce(subtopic, '') || ' ' || coalesce(summary, ''))
    ) STORED,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_segments_conv_idx ON conversation_segments(conversation_id);
CREATE INDEX IF NOT EXISTS conversation_segments_user_conv_idx ON conversation_segments(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS conversation_segments_search_vector_idx ON conversation_segments USING gin(search_vector);
CREATE INDEX IF NOT EXISTS conversation_segments_embedding_idx ON conversation_segments USING hnsw (embedding vector_cosine_ops);

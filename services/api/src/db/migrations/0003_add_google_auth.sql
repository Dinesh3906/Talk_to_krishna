-- ==============================================================================
-- Talk to Krishna - Migration 0003: Google Authentication Support
-- Versioned, idempotent migration for PostgreSQL
-- ==============================================================================

-- Add google_id and avatar_url to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create index for fast Google ID lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

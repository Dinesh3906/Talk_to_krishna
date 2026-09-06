-- ==============================================================================
-- Talk to Krishna - Migration 0004: OTP Verification & Account Security
-- Versioned, idempotent migration for PostgreSQL
-- ==============================================================================

-- 1. Extend Users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) UNIQUE;

-- Mark existing anonymous or Google OAuth users as verified so they are never locked out
UPDATE users SET is_verified = TRUE WHERE is_anonymous = TRUE OR google_id IS NOT NULL;
-- Also mark existing active accounts created before this migration as verified
UPDATE users SET is_verified = TRUE WHERE created_at < NOW() AND is_verified IS NOT TRUE;

-- 2. Create OTP Verifications Table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    destination VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance and security lookups
CREATE INDEX IF NOT EXISTS idx_otp_dest_purpose_consumed 
ON otp_verifications(destination, purpose, consumed_at);

CREATE INDEX IF NOT EXISTS idx_otp_user_id 
ON otp_verifications(user_id);

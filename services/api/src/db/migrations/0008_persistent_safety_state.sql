-- Persist the categorical conversation safety state across API workers/restarts.
-- The state does not store additional user message content.
ALTER TABLE conversation_states
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(40) NOT NULL DEFAULT 'NONE';

ALTER TABLE conversation_states
  ADD COLUMN IF NOT EXISTS risk_state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

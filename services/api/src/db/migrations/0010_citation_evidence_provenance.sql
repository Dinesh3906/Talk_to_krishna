-- Preserve the exact retrieved evidence identity and source type for each citation.
ALTER TABLE message_citations
  ADD COLUMN IF NOT EXISTS evidence_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_source_type VARCHAR(100);

CREATE INDEX IF NOT EXISTS message_citations_evidence_id_idx
  ON message_citations(evidence_id);

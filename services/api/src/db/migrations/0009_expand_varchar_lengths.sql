-- ==============================================================================
-- Talk to Krishna - Migration 0009: Expand Varchar Columns for Long Sanskrit Headings
-- Expands section, chapter, parva, and source_reference to varchar(255) / text
-- ==============================================================================

ALTER TABLE mahabharata_chunks 
  ALTER COLUMN section TYPE varchar(255),
  ALTER COLUMN chapter TYPE varchar(255),
  ALTER COLUMN parva TYPE varchar(255),
  ALTER COLUMN source_reference TYPE varchar(255);

ALTER TABLE mahabharata_child_chunks 
  ALTER COLUMN section TYPE varchar(255),
  ALTER COLUMN parva TYPE varchar(255),
  ALTER COLUMN source_reference TYPE varchar(255);

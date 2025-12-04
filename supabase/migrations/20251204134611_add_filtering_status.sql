-- Add filtering status columns to assessments table
-- Used for parameter-based check filtering feature

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS filtering_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS filtering_checks_processed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_checks_total INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_excluded_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filtering_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filtering_error TEXT;

-- Add index for filtering status queries
CREATE INDEX IF NOT EXISTS idx_assessments_filtering_status ON assessments(filtering_status);

COMMENT ON COLUMN assessments.filtering_status IS 'Status of parameter-based filtering: pending, in_progress, completed, failed';
COMMENT ON COLUMN assessments.filtering_checks_processed IS 'Number of checks evaluated so far';
COMMENT ON COLUMN assessments.filtering_checks_total IS 'Total number of checks to evaluate';
COMMENT ON COLUMN assessments.filtering_excluded_count IS 'Number of checks marked as excluded';

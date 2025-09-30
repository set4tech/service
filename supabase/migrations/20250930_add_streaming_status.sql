-- Add columns to track streaming progress
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS seeding_status TEXT DEFAULT 'not_started',
  -- 'not_started' | 'in_progress' | 'completed' | 'failed'
  ADD COLUMN IF NOT EXISTS sections_processed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sections_total INTEGER DEFAULT 0;

-- Index for querying in-progress assessments
CREATE INDEX IF NOT EXISTS idx_assessments_seeding_status
  ON assessments(seeding_status);

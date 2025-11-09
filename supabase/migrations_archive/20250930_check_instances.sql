-- Add instance support to checks table
-- This allows a single check to have multiple instances (e.g., checking multiple doors against the same code section)

ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS instance_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS instance_label VARCHAR(255);

-- Update existing checks to be instance 1
UPDATE checks SET instance_number = 1 WHERE instance_number IS NULL;

-- Make instance_number NOT NULL after setting defaults
ALTER TABLE checks ALTER COLUMN instance_number SET NOT NULL;

-- Add index for fetching all instances of a parent check
CREATE INDEX IF NOT EXISTS idx_checks_parent ON checks(parent_check_id) WHERE parent_check_id IS NOT NULL;

-- Add index for assessment + parent lookup
CREATE INDEX IF NOT EXISTS idx_checks_assessment_parent ON checks(assessment_id, parent_check_id);

-- Add comment explaining the instance system
COMMENT ON COLUMN checks.instance_number IS 'Instance number: 1 for parent/original, 2+ for cloned instances';
COMMENT ON COLUMN checks.instance_label IS 'User-friendly label for this instance (e.g., "Door 1A", "South Entry")';
COMMENT ON COLUMN checks.parent_check_id IS 'NULL for parent checks, references parent check ID for instances';

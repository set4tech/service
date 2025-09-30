-- Add manual override columns to checks table
-- Allows manual compliance judgments without requiring LLM assessment

ALTER TABLE checks
ADD COLUMN IF NOT EXISTS manual_override TEXT CHECK (manual_override IN ('compliant', 'non_compliant', 'not_applicable')),
ADD COLUMN IF NOT EXISTS manual_override_note TEXT,
ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS manual_override_by TEXT;

-- Create index for filtering by override status
CREATE INDEX IF NOT EXISTS idx_checks_manual_override ON checks(manual_override) WHERE manual_override IS NOT NULL;

-- Add comments
COMMENT ON COLUMN checks.manual_override IS 'Manual compliance override: compliant, non_compliant, not_applicable, or NULL (no override)';
COMMENT ON COLUMN checks.manual_override_note IS 'Optional explanation for the manual override decision';
COMMENT ON COLUMN checks.manual_override_at IS 'Timestamp when manual override was set';
COMMENT ON COLUMN checks.manual_override_by IS 'User who set the manual override';

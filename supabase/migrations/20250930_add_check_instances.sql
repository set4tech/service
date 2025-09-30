-- Add instance tracking columns to checks table
-- Allows multiple check instances for the same code section

ALTER TABLE checks
ADD COLUMN IF NOT EXISTS instance_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS instance_label TEXT;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_checks_parent_check_id ON checks(parent_check_id);
CREATE INDEX IF NOT EXISTS idx_checks_instance_number ON checks(instance_number);

-- Add comments
COMMENT ON COLUMN checks.instance_number IS 'Instance number for checks with the same parent (1 = original, 2+ = clones)';
COMMENT ON COLUMN checks.instance_label IS 'Optional human-readable label for the instance (e.g., "Door 2 - North Entrance")';

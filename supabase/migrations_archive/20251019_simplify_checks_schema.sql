-- Migration: Simplify checks schema
-- Purpose:
--   1. Flatten section_overrides into checks table
--   2. Add is_excluded column to checks
--   3. Rename manual_override to manual_status for consistency
--   4. Remove human_override columns from analysis_runs
--
-- Run on: Production and Development databases separately

BEGIN;

-- ============================================================================
-- PART 1: Modify checks table
-- ============================================================================

-- Add new columns to checks table
ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

-- Rename manual_override to manual_status
ALTER TABLE checks
  RENAME COLUMN manual_override TO manual_status;

-- Update the check constraint to use new column name
ALTER TABLE checks
  DROP CONSTRAINT IF EXISTS checks_manual_override_check;

ALTER TABLE checks
  ADD CONSTRAINT checks_manual_status_check
  CHECK (manual_status = ANY (ARRAY[
    'compliant'::text,
    'non_compliant'::text,
    'not_applicable'::text,
    'insufficient_information'::text
  ]));

-- Recreate index with new column name
DROP INDEX IF EXISTS idx_checks_manual_override;
CREATE INDEX idx_checks_manual_status ON checks(manual_status)
  WHERE manual_status IS NOT NULL;

-- Also rename the related columns to match
ALTER TABLE checks
  RENAME COLUMN manual_override_note TO manual_status_note;
ALTER TABLE checks
  RENAME COLUMN manual_override_at TO manual_status_at;
ALTER TABLE checks
  RENAME COLUMN manual_override_by TO manual_status_by;

-- ============================================================================
-- PART 2: Drop section_overrides table
-- ============================================================================

-- Note: Any existing section overrides will be lost
-- If you need to preserve them, migrate the data first before running this
DROP TABLE IF EXISTS section_overrides CASCADE;

-- ============================================================================
-- PART 3: Clean up analysis_runs table
-- ============================================================================

-- Drop human override columns (now handled in checks table)
ALTER TABLE analysis_runs
  DROP COLUMN IF EXISTS human_override,
  DROP COLUMN IF EXISTS human_notes;

-- ============================================================================
-- PART 4: Update comments for documentation
-- ============================================================================

COMMENT ON COLUMN checks.manual_status IS 'Human override status: compliant, non_compliant, not_applicable, or insufficient_information';
COMMENT ON COLUMN checks.is_excluded IS 'Whether this check is excluded from the assessment';
COMMENT ON COLUMN checks.excluded_reason IS 'Reason why this check was excluded';

COMMIT;

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Check new columns exist
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'checks'
-- AND column_name IN ('manual_status', 'is_excluded', 'excluded_reason')
-- ORDER BY column_name;

-- Verify section_overrides is gone
-- SELECT COUNT(*) FROM information_schema.tables
-- WHERE table_name = 'section_overrides';

-- Verify analysis_runs columns dropped
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'analysis_runs'
-- AND column_name IN ('human_override', 'human_notes');

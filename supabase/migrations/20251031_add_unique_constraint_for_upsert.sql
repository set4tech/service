-- Add unique constraint to support ON CONFLICT in upserts
-- The seed endpoint needs a non-partial unique constraint for .upsert() to work

-- First, remove any existing duplicate checks (if any exist)
-- This ensures the constraint can be created cleanly
DELETE FROM checks a USING checks b
WHERE a.id > b.id
  AND a.assessment_id = b.assessment_id
  AND a.code_section_key = b.code_section_key
  AND a.instance_label IS NOT DISTINCT FROM b.instance_label;

-- Drop the old partial indexes that don't work with ON CONFLICT
DROP INDEX IF EXISTS unique_section_check;
DROP INDEX IF EXISTS unique_element_check;

-- Create a unique index using COALESCE to handle both NULL and non-NULL instance_labels
-- This treats NULL instance_label as an empty string for uniqueness purposes
-- This allows:
--   - One section check per (assessment_id, code_section_key) when instance_label IS NULL
--   - Multiple element checks per (assessment_id, code_section_key) with different instance_labels
CREATE UNIQUE INDEX unique_check_per_assessment_section_instance 
ON checks (assessment_id, code_section_key, COALESCE(instance_label, ''));

-- Add a comment to document the constraint
COMMENT ON INDEX unique_check_per_assessment_section_instance IS 
'Ensures uniqueness of checks per assessment, section, and instance. NULL instance_label is coalesced to empty string to treat it as a distinct value.';


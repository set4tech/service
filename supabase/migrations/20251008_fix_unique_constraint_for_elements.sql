-- Fix unique_check_per_section constraint to exclude element parent checks
-- Element parent checks (check_type='element') legitimately have NULL code_section_number
-- because they represent the overall element instance, not a specific code section

-- Drop the existing constraint
ALTER TABLE checks DROP CONSTRAINT IF EXISTS unique_check_per_section;

-- Create a partial unique index instead (only applies to section checks)
-- This replaces the constraint but allows element parent checks to have NULL code_section_number
CREATE UNIQUE INDEX unique_check_per_section ON checks (assessment_id, code_section_number, parent_check_id, instance_number)
  NULLS NOT DISTINCT
  WHERE check_type = 'section' OR check_type IS NULL;

-- Note: We include "OR check_type IS NULL" to handle any legacy checks without a check_type value

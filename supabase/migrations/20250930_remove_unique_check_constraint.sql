-- Allow multiple check instances for the same section in an assessment
ALTER TABLE checks
DROP CONSTRAINT IF EXISTS unique_check_per_section;

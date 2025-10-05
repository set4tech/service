-- Drop the old constraint that prevented element instances
ALTER TABLE checks
DROP CONSTRAINT IF EXISTS unique_check_per_section;

-- Add new constraint that allows multiple instances but prevents true duplicates
-- For template checks (parent_check_id IS NULL), ensures one per section
-- For instance checks, ensures unique instance numbers per parent
ALTER TABLE checks
ADD CONSTRAINT unique_check_per_section
UNIQUE NULLS NOT DISTINCT (assessment_id, code_section_number, parent_check_id, instance_number);

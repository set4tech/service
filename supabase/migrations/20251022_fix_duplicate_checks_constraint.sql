-- Fix unique constraint to prevent duplicate checks with NULL instance_label
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints, so we need partial indexes

-- Drop the existing constraint that doesn't work for NULLs
ALTER TABLE checks DROP CONSTRAINT IF EXISTS unique_check_instance;

-- Create a partial unique index for section checks (where instance_label IS NULL)
-- This prevents duplicates for (assessment_id, code_section_key) when instance_label is NULL
CREATE UNIQUE INDEX IF NOT EXISTS unique_section_check 
ON checks (assessment_id, code_section_key) 
WHERE instance_label IS NULL;

-- Create a unique index for element checks (where instance_label IS NOT NULL)
-- This prevents duplicates for (assessment_id, code_section_key, instance_label)
CREATE UNIQUE INDEX IF NOT EXISTS unique_element_check 
ON checks (assessment_id, code_section_key, instance_label) 
WHERE instance_label IS NOT NULL;

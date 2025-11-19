-- Fix unique constraint to use element_instance_id instead of instance_label
-- This fixes the bug where creating multiple element instances fails with duplicate key error
-- because seed_element_checks() populates element_instance_id but NOT instance_label

-- Step 1: Drop the old constraint
DROP INDEX IF EXISTS idx_checks_unique_element_based;

-- Step 2: Create new constraint using element_instance_id
-- This ensures one check per (assessment, section, element_instance) combination
CREATE UNIQUE INDEX idx_checks_unique_element_based
ON checks (assessment_id, section_id, element_instance_id)
WHERE element_instance_id IS NOT NULL;




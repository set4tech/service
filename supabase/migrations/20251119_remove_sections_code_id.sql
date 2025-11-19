-- Remove the legacy sections.code_id column
-- The canonical relationship is sections → chapters → codes
-- This migration completes the architectural shift started in 20251030_big_model_refactor.sql

-- Step 1: Drop the UNIQUE constraint that uses code_id
ALTER TABLE sections DROP CONSTRAINT IF EXISTS unique_section_number_per_code;

-- Step 2: Drop the code_id column
ALTER TABLE sections DROP COLUMN IF EXISTS code_id;

-- Step 3: Add new UNIQUE constraint based on chapter_id
-- This ensures section numbers are unique within each chapter
ALTER TABLE sections 
ADD CONSTRAINT unique_section_number_per_chapter 
UNIQUE (chapter_id, number);

COMMENT ON CONSTRAINT unique_section_number_per_chapter ON sections IS 
  'Ensures section numbers are unique within each chapter. '
  'Replaces the old unique_section_number_per_code constraint.';


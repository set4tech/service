-- Remove drawing_assessable column from sections table
-- This column was only used during seeding and is no longer needed

-- Drop the index first
DROP INDEX IF EXISTS idx_sections_drawing_assessable;

-- Drop the column
ALTER TABLE sections DROP COLUMN IF EXISTS drawing_assessable;


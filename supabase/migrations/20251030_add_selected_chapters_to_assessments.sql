-- Add selected_chapter_ids column to assessments table
-- This replaces the project-level selected_code_ids with assessment-level chapter selection
ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS selected_chapter_ids UUID[];

-- Add comment explaining the column
COMMENT ON COLUMN assessments.selected_chapter_ids IS 'Array of chapter UUIDs that should be assessed (e.g., 11A, 11B, 10). Allows per-assessment chapter selection rather than project-wide.';

-- Create index for faster lookups when filtering by chapters
CREATE INDEX IF NOT EXISTS idx_assessments_selected_chapters ON assessments USING GIN (selected_chapter_ids);

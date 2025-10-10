-- Add unannotated_drawing_url column to projects table
-- This stores the URL to the original drawing PDF without any markups or annotations

ALTER TABLE projects
ADD COLUMN unannotated_drawing_url TEXT;

COMMENT ON COLUMN projects.unannotated_drawing_url IS 'S3 URL to the original architectural drawings PDF without markups or annotations';

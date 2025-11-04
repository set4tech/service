-- Add PDF page dimension columns to projects table
-- These store the physical dimensions of the uploaded PDF for auto-filling calibration

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS pdf_width_points NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS pdf_height_points NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS pdf_width_inches NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS pdf_height_inches NUMERIC(10, 2);

COMMENT ON COLUMN projects.pdf_width_points IS 'PDF page width in points (includes UserUnit scaling)';
COMMENT ON COLUMN projects.pdf_height_points IS 'PDF page height in points (includes UserUnit scaling)';
COMMENT ON COLUMN projects.pdf_width_inches IS 'PDF page width in inches (points / 72)';
COMMENT ON COLUMN projects.pdf_height_inches IS 'PDF page height in inches (points / 72)';


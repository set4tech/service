-- Add variable extraction columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS extracted_variables JSONB,
ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS extraction_progress JSONB,
ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extraction_error TEXT;

-- Create index on extraction_status for filtering
CREATE INDEX IF NOT EXISTS idx_projects_extraction_status ON projects(extraction_status);

-- Add comment for documentation
COMMENT ON COLUMN projects.extracted_variables IS 'JSON object containing extracted building variables from PDF';
COMMENT ON COLUMN projects.extraction_status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN projects.extraction_progress IS 'Progress tracking: {current: number, total: number, category: string}';
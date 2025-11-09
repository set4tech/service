-- Add tables and figures columns to sections table
-- Stores table data (CSV format) and figure URLs from building codes

-- Add tables column to store TableBlock data
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS tables JSONB DEFAULT '[]'::jsonb;

-- Add figures column to store figure/image URLs
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS figures JSONB DEFAULT '[]'::jsonb;

-- Create GIN indexes for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_sections_tables ON sections USING GIN (tables);
CREATE INDEX IF NOT EXISTS idx_sections_figures ON sections USING GIN (figures);

-- Comments
COMMENT ON COLUMN sections.tables IS 'Array of table objects with number, title, and CSV data';
COMMENT ON COLUMN sections.figures IS 'Array of figure URLs (prefixed with "figure:" or "table:" type)';

-- Example data structures:
-- tables: [{"number": "11B-208.2", "title": "Table caption", "csv": "\"col1\",\"col2\"\n\"val1\",\"val2\""}]
-- figures: ["figure:https://s3.../11B-104.jpg", "table:11B-208.2"]

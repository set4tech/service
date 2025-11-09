-- Add selected_code_ids column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS selected_code_ids TEXT[];

-- Add comment explaining the column
COMMENT ON COLUMN projects.selected_code_ids IS 'Array of Neo4j Code node IDs that are relevant to this project';
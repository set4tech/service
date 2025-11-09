-- Add never_relevant column to sections table
-- This flag marks sections that should be globally excluded from all future assessments
ALTER TABLE sections
ADD COLUMN never_relevant BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX idx_sections_never_relevant ON sections(never_relevant) WHERE never_relevant = true;

-- Add comment
COMMENT ON COLUMN sections.never_relevant IS 'Global flag to exclude this section from all future assessments. Cannot be easily reversed.';

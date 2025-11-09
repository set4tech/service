-- Add floorplan_relevant column to sections table
-- This flag marks sections that are specifically relevant to floorplan analysis
ALTER TABLE sections
ADD COLUMN floorplan_relevant BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster filtering and ordering
CREATE INDEX idx_sections_floorplan_relevant ON sections(floorplan_relevant) WHERE floorplan_relevant = true;

-- Add comment
COMMENT ON COLUMN sections.floorplan_relevant IS 'Flag to mark sections as specifically relevant to floorplan analysis. These sections are prioritized when returning code sections.';

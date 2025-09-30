-- Add drawing assessability classification to sections

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS drawing_assessable BOOLEAN DEFAULT true;

ALTER TABLE sections
ADD COLUMN IF NOT EXISTS assessability_tags TEXT[];

CREATE INDEX IF NOT EXISTS idx_sections_drawing_assessable
ON sections(drawing_assessable);

CREATE INDEX IF NOT EXISTS idx_sections_assessability_tags
ON sections USING GIN(assessability_tags);

COMMENT ON COLUMN sections.drawing_assessable IS
  'Whether this section can be assessed from architectural drawings';
COMMENT ON COLUMN sections.assessability_tags IS
  'Tags explaining why section may not be assessable: too_short, placeholder, definitional, administrative, procedural, summary, not_physical';

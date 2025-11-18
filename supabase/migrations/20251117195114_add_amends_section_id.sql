-- Add support for code amendments
-- A section can amend another section (e.g., Sacramento local amendments to CBC)

-- Add amends_section_id column to sections table
ALTER TABLE sections
ADD COLUMN amends_section_id UUID REFERENCES sections(id) ON DELETE SET NULL;

-- Add index for performance when querying amended sections
CREATE INDEX idx_sections_amends_section_id ON sections(amends_section_id);

-- Add comment explaining the column
COMMENT ON COLUMN sections.amends_section_id IS
'References the section that this section amends. Used for local jurisdiction amendments to base building codes. For example, Sacramento Municipal Code section 15.20.030.A amends CBC section 502.1.';

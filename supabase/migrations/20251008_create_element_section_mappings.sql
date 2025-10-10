  -- Create element_group_section_mappings table
-- This replaces the element_sections array on checks table
CREATE TABLE IF NOT EXISTS element_group_section_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_group_id UUID NOT NULL REFERENCES element_groups(id) ON DELETE CASCADE,
  section_key VARCHAR(255) NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(element_group_id, section_key)
);

-- Create indexes for fast lookups
CREATE INDEX idx_element_section_mappings_element ON element_group_section_mappings(element_group_id);
CREATE INDEX idx_element_section_mappings_section ON element_group_section_mappings(section_key);

-- Migrate existing element_sections data from template checks (instance_number = 0)
INSERT INTO element_group_section_mappings (element_group_id, section_key)
  c.element_group_id,
SELECT DISTINCT
  unnest(c.element_sections) as section_key
FROM checks c
WHERE
  c.check_type = 'element'
  AND c.instance_number = 0
  AND c.element_group_id IS NOT NULL
  AND c.element_sections IS NOT NULL
ON CONFLICT (element_group_id, section_key) DO NOTHING;

-- Add comment
COMMENT ON TABLE element_group_section_mappings IS 'Maps which code sections apply to each element group (e.g., Doors -> [11B-404.2.6, 11B-404.2.7])';

-- Add element groups system for dual-mode compliance checking
-- Enables both section-by-section and element-by-element checks in same assessment

-- Element groups table (hardcoded: doors, bathrooms, kitchens)
CREATE TABLE element_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Map code sections to element groups
CREATE TABLE element_section_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_group_id UUID NOT NULL REFERENCES element_groups(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(element_group_id, section_key)
);

CREATE INDEX idx_element_mappings_group ON element_section_mappings(element_group_id);
CREATE INDEX idx_element_mappings_section ON element_section_mappings(section_key);

-- Extend checks table for element checks
ALTER TABLE checks ADD COLUMN check_type TEXT DEFAULT 'section'
  CHECK (check_type IN ('section', 'element'));
ALTER TABLE checks ADD COLUMN element_group_id UUID
  REFERENCES element_groups(id) ON DELETE SET NULL;
ALTER TABLE checks ADD COLUMN element_sections TEXT[];  -- Array of section_keys for this element

CREATE INDEX idx_checks_type ON checks(check_type);
CREATE INDEX idx_checks_element_group ON checks(element_group_id);
CREATE INDEX idx_checks_element_sections ON checks USING GIN (element_sections);

-- Extend analysis_runs to store section-level results for element checks
ALTER TABLE analysis_runs ADD COLUMN section_results JSONB;
-- Format: [{ section_key: '404.1', status: 'compliant', reasoning: '...', confidence: 'high' }, ...]

CREATE INDEX idx_analysis_runs_section_results ON analysis_runs USING GIN (section_results);

COMMENT ON COLUMN analysis_runs.section_results IS 'For element checks: array of per-section compliance results. For section checks: null.';

-- Insert hardcoded element groups
INSERT INTO element_groups (name, slug, description, icon, sort_order) VALUES
  ('Doors', 'doors', 'Door and doorway compliance checks', 'door-open', 1),
  ('Bathrooms', 'bathrooms', 'Restroom and toilet facility compliance', 'shower', 2),
  ('Kitchens', 'kitchens', 'Kitchen and food preparation area compliance', 'utensils', 3);

COMMENT ON TABLE element_groups IS 'Hardcoded element categories: doors, bathrooms, kitchens';
COMMENT ON TABLE element_section_mappings IS 'Maps which code sections belong to which element group (prevents duplication in section checks)';
COMMENT ON COLUMN checks.check_type IS 'Type: section (traditional) or element (grouped by physical element)';
COMMENT ON COLUMN checks.element_sections IS 'For element checks: array of section_keys that apply to this element instance';

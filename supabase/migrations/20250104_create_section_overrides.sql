-- Create table for section-level manual overrides
CREATE TABLE IF NOT EXISTS section_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_number TEXT NOT NULL,
  override_status TEXT NOT NULL CHECK (override_status IN ('compliant', 'non_compliant', 'not_applicable')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(check_id, section_key)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_section_overrides_check_id ON section_overrides(check_id);
CREATE INDEX IF NOT EXISTS idx_section_overrides_section_key ON section_overrides(section_key);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_section_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER section_overrides_updated_at
  BEFORE UPDATE ON section_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_section_override_updated_at();

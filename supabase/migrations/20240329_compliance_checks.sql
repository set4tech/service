-- Compliance Sessions table
CREATE TABLE IF NOT EXISTS compliance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  code_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Section Checks table
CREATE TABLE IF NOT EXISTS section_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES compliance_sessions(id) ON DELETE CASCADE,
  section_key VARCHAR(500) NOT NULL,
  section_number VARCHAR(100) NOT NULL,
  section_title TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'screenshots_captured', 'analyzing', 'complete', 'skipped', 'not_applicable')),
  is_cloneable BOOLEAN DEFAULT FALSE,
  analysis_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, section_key)
);

-- Section Screenshots table
CREATE TABLE IF NOT EXISTS section_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_check_id UUID REFERENCES section_checks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  instance_id UUID,
  instance_name VARCHAR(255),
  analysis_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_compliance_sessions_project_id ON compliance_sessions(project_id);
CREATE INDEX idx_section_checks_session_id ON section_checks(session_id);
CREATE INDEX idx_section_checks_status ON section_checks(status);
CREATE INDEX idx_section_screenshots_check_id ON section_screenshots(section_check_id);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_compliance_sessions_updated_at
  BEFORE UPDATE ON compliance_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_section_checks_updated_at
  BEFORE UPDATE ON section_checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (if using Row Level Security)
ALTER TABLE compliance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_screenshots ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust based on your auth setup)
CREATE POLICY "Users can view their own compliance sessions"
  ON compliance_sessions FOR SELECT
  USING (true); -- Adjust based on your auth

CREATE POLICY "Users can create compliance sessions"
  ON compliance_sessions FOR INSERT
  WITH CHECK (true); -- Adjust based on your auth

CREATE POLICY "Users can update their own compliance sessions"
  ON compliance_sessions FOR UPDATE
  USING (true); -- Adjust based on your auth
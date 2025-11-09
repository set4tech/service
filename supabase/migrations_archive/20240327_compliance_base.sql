-- supabase/migrations/20250929_compliance.sql
-- Enable UUID extension (using pgcrypto for Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  building_address TEXT,
  building_type VARCHAR(100),
  code_assembly_id VARCHAR(255),
  pdf_url TEXT,
  status VARCHAR(50) DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_sections INTEGER,
  assessed_sections INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress'
);

-- Prompt Templates
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT,
  user_prompt_template TEXT,
  instruction_template TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(name, version)
);

-- Checks
CREATE TABLE IF NOT EXISTS checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  code_section_key VARCHAR(255) NOT NULL,
  code_section_number VARCHAR(100),
  code_section_title TEXT,
  check_name VARCHAR(255),
  check_location VARCHAR(255),
  parent_check_id UUID REFERENCES checks(id),
  prompt_template_id UUID REFERENCES prompt_templates(id),
  actual_prompt_used TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_section ON checks (assessment_id, code_section_key);

-- Analysis Runs
CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL DEFAULT 1,
  compliance_status VARCHAR(50),
  confidence VARCHAR(50),
  ai_provider VARCHAR(50),
  ai_model VARCHAR(100),
  ai_reasoning TEXT,
  violations JSONB,
  compliant_aspects JSONB,
  recommendations JSONB,
  additional_evidence_needed JSONB,
  raw_ai_response TEXT,
  human_override BOOLEAN DEFAULT FALSE,
  human_notes TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  execution_time_ms INTEGER,
  UNIQUE(check_id, run_number)
);

-- Screenshots
CREATE TABLE IF NOT EXISTS screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
  analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL,
  crop_coordinates JSONB,
  screenshot_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- Check tags
CREATE TABLE IF NOT EXISTS check_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  UNIQUE(check_id, tag)
);

-- Views
CREATE OR REPLACE VIEW latest_analysis_runs AS
SELECT DISTINCT ON (check_id)
  ar.*,
  c.code_section_key,
  c.code_section_number,
  c.check_name
FROM analysis_runs ar
JOIN checks c ON ar.check_id = c.id
ORDER BY check_id, run_number DESC;

CREATE OR REPLACE VIEW check_summary AS
SELECT
  c.*,
  lar.compliance_status as latest_status,
  lar.confidence as latest_confidence,
  lar.executed_at as last_analyzed_at,
  COUNT(DISTINCT ar.id) as total_runs,
  COUNT(DISTINCT s.id) as screenshot_count
FROM checks c
LEFT JOIN latest_analysis_runs lar ON c.id = lar.check_id
LEFT JOIN analysis_runs ar ON c.id = ar.check_id
LEFT JOIN screenshots s ON c.id = s.check_id
GROUP BY c.id, lar.compliance_status, lar.confidence, lar.executed_at;
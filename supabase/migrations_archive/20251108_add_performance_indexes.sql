w-- Performance indexes for assessment page optimization
-- These indexes improve query performance for frequently accessed relationships

-- Checks by assessment (used in /api/assessments/[id]/checks)
CREATE INDEX IF NOT EXISTS idx_checks_assessment_status 
  ON checks(assessment_id, status);

-- Latest analysis runs (used in get_assessment_report RPC and checks API)
-- Ordered by run_number DESC to quickly find the latest run
CREATE INDEX IF NOT EXISTS idx_analysis_runs_check_run 
  ON analysis_runs(check_id, run_number DESC);

-- Screenshot assignments by check (heavily queried in checks API)
CREATE INDEX IF NOT EXISTS idx_screenshot_assignments_check 
  ON screenshot_check_assignments(check_id);

-- Element instances for element-grouped checks
-- Partial index only where element_instance_id is not null
CREATE INDEX IF NOT EXISTS idx_checks_element_instance
  ON checks(element_instance_id) WHERE element_instance_id IS NOT NULL;

-- Assessment progress tracking (used in progress calculations)
CREATE INDEX IF NOT EXISTS idx_checks_assessment_manual_status
  ON checks(assessment_id, manual_status);

-- Section lookups by key (used in checks queries with joins)
CREATE INDEX IF NOT EXISTS idx_sections_key
  ON sections(key);


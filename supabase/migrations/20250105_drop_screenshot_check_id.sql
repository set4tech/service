-- Drop the check_summary view first (depends on screenshots.check_id)
DROP VIEW IF EXISTS check_summary;

-- Drop the old foreign key constraint
ALTER TABLE screenshots DROP CONSTRAINT IF EXISTS screenshots_check_id_fkey;

-- Drop the check_id column (now fully replaced by junction table)
ALTER TABLE screenshots DROP COLUMN IF EXISTS check_id;

-- Recreate check_summary view with updated join via junction table
CREATE VIEW check_summary AS
SELECT
  c.id,
  c.assessment_id,
  c.code_section_key,
  c.code_section_number,
  c.code_section_title,
  c.check_name,
  c.check_location,
  c.parent_check_id,
  c.prompt_template_id,
  c.actual_prompt_used,
  c.status,
  c.created_at,
  c.updated_at,
  lar.compliance_status AS latest_status,
  lar.confidence AS latest_confidence,
  lar.executed_at AS last_analyzed_at,
  count(DISTINCT ar.id) AS total_runs,
  count(DISTINCT sca.screenshot_id) AS screenshot_count
FROM checks c
  LEFT JOIN latest_analysis_runs lar ON c.id = lar.check_id
  LEFT JOIN analysis_runs ar ON c.id = ar.check_id
  LEFT JOIN screenshot_check_assignments sca ON c.id = sca.check_id
GROUP BY c.id, lar.compliance_status, lar.confidence, lar.executed_at;

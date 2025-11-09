-- Drop unused element columns from checks table
-- element_sections: Legacy field from old model where element checks stored array of section keys
-- element_group_name: Denormalized cache that duplicated data from element_groups.name JOIN

-- Drop dependent view first
DROP VIEW IF EXISTS check_summary CASCADE;

-- Drop element_sections array column
ALTER TABLE checks DROP COLUMN IF EXISTS element_sections;

-- Drop element_group_name denormalized field
ALTER TABLE checks DROP COLUMN IF EXISTS element_group_name;

-- Recreate check_summary view without element_sections
CREATE VIEW check_summary AS
SELECT
  c.id,
  c.assessment_id,
  c.code_section_key,
  c.code_section_number,
  c.code_section_title,
  c.check_name,
  c.check_location,
  c.prompt_template_id,
  c.actual_prompt_used,
  c.status,
  c.created_at,
  c.updated_at,
  c.requires_review,
  c.instance_label,
  c.manual_override,
  c.manual_override_note,
  c.manual_override_at,
  c.manual_override_by,
  c.check_type,
  c.element_group_id,
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

-- Note: element_group_id is kept as it's actively used for grouping checks by element type
-- Apps now access element group name via JOIN: SELECT *, element_groups(name) FROM checks

COMMENT ON COLUMN checks.element_group_id IS 'Groups section checks by building element type (Doors, Bathrooms, etc). Access name via JOIN to element_groups table.';
COMMENT ON VIEW check_summary IS 'Summary view of checks with latest analysis status, screenshot count, and analysis run count';

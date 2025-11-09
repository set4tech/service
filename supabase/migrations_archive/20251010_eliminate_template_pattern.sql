-- Eliminate the template pattern from checks
-- Remove parent_check_id and instance_number (unused)
-- Keep instance_label (used for "Door 1", "Bathrooms 1", etc.)

-- Drop views that depend on these columns
DROP VIEW IF EXISTS latest_child_check_status;
DROP VIEW IF EXISTS check_summary;

-- Drop foreign key constraint first
ALTER TABLE checks DROP CONSTRAINT IF EXISTS checks_parent_check_id_fkey;

-- Drop columns
ALTER TABLE checks DROP COLUMN IF EXISTS parent_check_id;
ALTER TABLE checks DROP COLUMN IF EXISTS instance_number;

-- Recreate check_summary view without parent_check_id and instance_number
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
  c.element_sections,
  lar.compliance_status AS latest_status,
  lar.confidence AS latest_confidence,
  lar.executed_at AS last_analyzed_at,
  COUNT(DISTINCT ar.id) AS total_runs,
  COUNT(DISTINCT sca.screenshot_id) AS screenshot_count
FROM checks c
LEFT JOIN latest_analysis_runs lar ON c.id = lar.check_id
LEFT JOIN analysis_runs ar ON c.id = ar.check_id
LEFT JOIN screenshot_check_assignments sca ON c.id = sca.check_id
GROUP BY c.id, lar.compliance_status, lar.confidence, lar.executed_at;

-- Delete template checks (check_type = 'element' with no instance_label or generic labels)
-- These are the vestigial template checks created during seeding
DELETE FROM checks
WHERE check_type = 'element'
  AND element_group_id IS NOT NULL
  AND (instance_label IS NULL OR instance_label IN ('Doors Template', 'Bathrooms Template', 'Kitchens Template'));

-- All remaining checks are now standalone instances
-- Element checks are identified by: element_group_id IS NOT NULL
-- Section checks are: element_group_id IS NULL

COMMENT ON COLUMN checks.instance_label IS 'Label for element instances (e.g., "Door 1", "Bathrooms 2"). Used to group related section checks together.';
COMMENT ON COLUMN checks.check_type IS 'Type: "section" (both standalone and element-grouped sections) or "element" (deprecated, will be migrated to section)';

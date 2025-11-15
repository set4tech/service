-- Migrate screenshot assignments from check-based to element-instance-based
-- for all checks that have an element_instance_id

-- Insert screenshot ’ element_instance assignments
-- Deduplicates: if same screenshot assigned to multiple checks of same instance,
-- only creates one assignment
INSERT INTO screenshot_element_instance_assignments (
  screenshot_id,
  element_instance_id,
  is_original,
  assigned_at,
  assigned_by
)
SELECT DISTINCT ON (sca.screenshot_id, c.element_instance_id)
  sca.screenshot_id,
  c.element_instance_id,
  sca.is_original,
  sca.assigned_at,
  sca.assigned_by
FROM screenshot_check_assignments sca
JOIN checks c ON sca.check_id = c.id
WHERE c.element_instance_id IS NOT NULL
ORDER BY
  sca.screenshot_id,
  c.element_instance_id,
  sca.assigned_at ASC, -- Keep earliest assignment
  sca.is_original DESC -- Prefer is_original=true if multiple exist
ON CONFLICT (screenshot_id, element_instance_id) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM screenshot_element_instance_assignments;

  RAISE NOTICE 'Migration complete: % screenshot-element_instance assignments created', migrated_count;
END $$;

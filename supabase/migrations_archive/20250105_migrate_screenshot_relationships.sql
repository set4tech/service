-- Migrate all existing screenshot-check relationships to junction table
INSERT INTO screenshot_check_assignments (screenshot_id, check_id, is_original, assigned_at)
SELECT
  id,
  check_id,
  true,
  created_at
FROM screenshots
WHERE check_id IS NOT NULL;

-- Verify migration
DO $$
DECLARE
  screenshot_count integer;
  assignment_count integer;
BEGIN
  SELECT COUNT(*) INTO screenshot_count FROM screenshots WHERE check_id IS NOT NULL;
  SELECT COUNT(*) INTO assignment_count FROM screenshot_check_assignments WHERE is_original = true;

  IF screenshot_count != assignment_count THEN
    RAISE EXCEPTION 'Migration mismatch: % screenshots but % assignments', screenshot_count, assignment_count;
  END IF;

  RAISE NOTICE 'Successfully migrated % screenshot-check relationships', screenshot_count;
END $$;

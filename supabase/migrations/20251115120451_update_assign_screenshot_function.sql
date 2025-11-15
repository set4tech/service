-- Update assign_screenshot_to_element_instances to use new architecture
-- Now assigns to screenshot_element_instance_assignments for element-based checks
-- and screenshot_check_assignments for section-based checks

CREATE OR REPLACE FUNCTION public.assign_screenshot_to_element_instances(
  p_screenshot_id uuid,
  p_check_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned_count integer := 0;
  v_instance_assignments integer := 0;
  v_check_assignments integer := 0;
BEGIN
  -- 1. For element-based checks, assign to element_instance_assignments
  WITH element_checks AS (
    SELECT DISTINCT element_instance_id
    FROM checks
    WHERE id = ANY(p_check_ids)
      AND element_instance_id IS NOT NULL
  )
  INSERT INTO screenshot_element_instance_assignments (
    screenshot_id,
    element_instance_id,
    is_original
  )
  SELECT
    p_screenshot_id,
    element_instance_id,
    false -- First screenshot is not necessarily "original"
  FROM element_checks
  ON CONFLICT (screenshot_id, element_instance_id) DO NOTHING;

  GET DIAGNOSTICS v_instance_assignments = ROW_COUNT;

  -- 2. For section-based checks (no element_instance_id), assign directly to checks
  INSERT INTO screenshot_check_assignments (
    screenshot_id,
    check_id,
    is_original
  )
  SELECT
    p_screenshot_id,
    id,
    false
  FROM checks
  WHERE id = ANY(p_check_ids)
    AND element_instance_id IS NULL
  ON CONFLICT (screenshot_id, check_id) DO NOTHING;

  GET DIAGNOSTICS v_check_assignments = ROW_COUNT;

  v_assigned_count := v_instance_assignments + v_check_assignments;

  RETURN jsonb_build_object(
    'assigned_count', v_assigned_count,
    'instance_assignments', v_instance_assignments,
    'check_assignments', v_check_assignments
  );
END;
$$;

COMMENT ON FUNCTION assign_screenshot_to_element_instances IS
  'Assigns a screenshot to checks. For element-based checks, assigns to element_instance. For section-based checks, assigns directly to check.';

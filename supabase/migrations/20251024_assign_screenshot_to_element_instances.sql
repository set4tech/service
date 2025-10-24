-- Function to assign a screenshot to all checks in an element instance
-- When you assign to one check in an element, it assigns to ALL checks with same (assessment_id, element_group_id, instance_label)

CREATE OR REPLACE FUNCTION assign_screenshot_to_element_instances(
  p_screenshot_id uuid,
  p_check_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned_count integer;
BEGIN
  -- Insert assignments for all checks that match the element instances
  -- Uses a CTE to expand element instance checks to all their sibling checks
  WITH expanded_checks AS (
    SELECT DISTINCT c2.id as check_id
    FROM checks c1
    JOIN checks c2 ON (
      c1.assessment_id = c2.assessment_id
      AND c1.element_group_id = c2.element_group_id
      AND c1.instance_label = c2.instance_label
      AND c1.element_group_id IS NOT NULL
      AND c1.instance_label IS NOT NULL
    )
    WHERE c1.id = ANY(p_check_ids)

    UNION

    -- Also include any non-element checks (section checks) directly
    SELECT id as check_id
    FROM checks
    WHERE id = ANY(p_check_ids)
      AND (element_group_id IS NULL OR instance_label IS NULL)
  )
  INSERT INTO screenshot_check_assignments (screenshot_id, check_id, is_original)
  SELECT p_screenshot_id, check_id, false
  FROM expanded_checks
  ON CONFLICT (screenshot_id, check_id) DO NOTHING;

  GET DIAGNOSTICS v_assigned_count = ROW_COUNT;

  RETURN jsonb_build_object('assigned_count', v_assigned_count);
END;
$$;

-- Backfill screenshot assignments for element-based checks
-- This script finds screenshots assigned to SOME checks in an element instance,
-- and assigns them to ALL checks in that element instance

-- First, let's see what needs to be backfilled
WITH element_screenshot_assignments AS (
  SELECT
    sca.screenshot_id,
    c.assessment_id,
    c.element_group_id,
    c.instance_label,
    COUNT(DISTINCT sca.check_id) as currently_assigned
  FROM screenshot_check_assignments sca
  JOIN checks c ON sca.check_id = c.id
  WHERE c.element_group_id IS NOT NULL
    AND c.instance_label IS NOT NULL
  GROUP BY sca.screenshot_id, c.assessment_id, c.element_group_id, c.instance_label
),
instance_totals AS (
  SELECT
    assessment_id,
    element_group_id,
    instance_label,
    COUNT(*) as total_checks
  FROM checks
  WHERE element_group_id IS NOT NULL
    AND instance_label IS NOT NULL
  GROUP BY assessment_id, element_group_id, instance_label
)
-- Show what will be expanded (screenshots not assigned to ALL checks in instance)
SELECT
  esa.screenshot_id,
  esa.instance_label,
  esa.currently_assigned,
  it.total_checks,
  it.total_checks - esa.currently_assigned as missing_assignments
FROM element_screenshot_assignments esa
JOIN instance_totals it ON (
  esa.assessment_id = it.assessment_id
  AND esa.element_group_id = it.element_group_id
  AND esa.instance_label = it.instance_label
)
WHERE esa.currently_assigned < it.total_checks
ORDER BY esa.instance_label, esa.screenshot_id;

-- Now perform the backfill
-- For each screenshot that needs expansion, insert assignments to all sibling checks
WITH element_screenshot_assignments AS (
  SELECT
    sca.screenshot_id,
    c.assessment_id,
    c.element_group_id,
    c.instance_label,
    COUNT(DISTINCT sca.check_id) as currently_assigned
  FROM screenshot_check_assignments sca
  JOIN checks c ON sca.check_id = c.id
  WHERE c.element_group_id IS NOT NULL
    AND c.instance_label IS NOT NULL
  GROUP BY sca.screenshot_id, c.assessment_id, c.elementno _group_id, c.instance_label
),
instance_totals AS (
  SELECT
    assessment_id,
    element_group_id,
    instance_label,
    COUNT(*) as total_checks
  FROM checks
  WHERE element_group_id IS NOT NULL
    AND instance_label IS NOT NULL
  GROUP BY assessment_id, element_group_id, instance_label
),
needs_expansion AS (
  SELECT
    esa.screenshot_id,
    esa.assessment_id,
    esa.element_group_id,wha
    esa.instance_label
  FROM element_screenshot_assignments esa
  JOIN instance_totals it ON (
    esa.assessment_id = it.assessment_id
    AND esa.element_group_id = it.element_group_id
    AND esa.instance_label = it.instance_label
  )
  WHERE esa.currently_assigned < it.total_checks
),
all_target_checks AS (
  SELECT DISTINCT
    ne.screenshot_id,
    c.id as check_id
  FROM needs_expansion ne
  JOIN checks c ON (
    c.assessment_id = ne.assessment_id
    AND c.element_group_id = ne.element_group_id
    AND c.instance_label = ne.instance_label
  )
)
INSERT INTO screenshot_check_assignments (screenshot_id, check_id, is_original)
SELECT screenshot_id, check_id, false
FROM all_target_checks
ON CONFLICT (screenshot_id, check_id) DO NOTHING;

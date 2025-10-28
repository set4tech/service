-- Migration: Share screenshots across all sections within the same element instance
--
-- Problem: When a screenshot is captured for an element instance (e.g., "Bathrooms 10"),
-- it's only assigned to the active check (one section). But AI analysis runs on ALL sections
-- for that element instance, creating violations on sections without screenshots.
--
-- Solution: For each element instance, copy screenshot assignments to ALL sections
-- within that instance (where they share the same assessment_id, element_group_id, and instance_label).

-- Insert screenshot assignments for all checks in the same element instance
INSERT INTO screenshot_check_assignments (check_id, screenshot_id, assigned_at)
SELECT DISTINCT
  c_target.id as target_check_id,
  sca.screenshot_id,
  NOW()
FROM checks c
-- Get checks that have screenshots assigned
JOIN screenshot_check_assignments sca ON c.id = sca.check_id
-- Cross join with all checks in the same element instance
JOIN checks c_target ON
  c_target.assessment_id = c.assessment_id
  AND c_target.element_group_id = c.element_group_id
  AND c_target.instance_label = c.instance_label
WHERE
  -- Only process element-based checks (not standalone section checks)
  c.element_group_id IS NOT NULL
  AND c.instance_label IS NOT NULL
  -- Exclude checks that already have this screenshot
  AND NOT EXISTS (
    SELECT 1
    FROM screenshot_check_assignments existing
    WHERE existing.check_id = c_target.id
      AND existing.screenshot_id = sca.screenshot_id
  )
ON CONFLICT (check_id, screenshot_id) DO NOTHING;

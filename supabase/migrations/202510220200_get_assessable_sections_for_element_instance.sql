-- Function to get all assessable sections for an element instance
-- This returns all sections mapped to the element group that:
-- 1. Are not globally excluded (never_relevant = false)
-- 2. Are not excluded for this specific assessment (is_excluded = false or no check exists)

CREATE OR REPLACE FUNCTION get_assessable_sections_for_element_instance(
  p_assessment_id UUID,
  p_element_group_id UUID,
  p_instance_label TEXT
)
RETURNS TABLE (
  section_key TEXT,
  section_number TEXT,
  section_title TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      esm.section_key,
      s.number,
      s.title
    FROM element_section_mappings esm
    INNER JOIN sections s ON esm.section_key = s.key
    WHERE esm.element_group_id = p_element_group_id
      AND s.never_relevant = false
      AND NOT EXISTS (
        -- Exclude if there's a check for this section that is marked excluded
        SELECT 1 FROM checks c
        WHERE c.assessment_id = p_assessment_id
          AND c.element_group_id = p_element_group_id
          AND c.instance_label = p_instance_label
          AND c.code_section_key = esm.section_key
          AND c.is_excluded = true
      )
    ORDER BY s.number;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_assessable_sections_for_element_instance(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_assessable_sections_for_element_instance(UUID, UUID, TEXT) TO service_role;

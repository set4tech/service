-- Optimize get_element_sections to return full section details
-- This eliminates the need for an extra query in the API
DROP function IF EXISTS get_element_sections(uuid, uuid);
CREATE OR REPLACE FUNCTION get_element_sections(
  p_element_group_id uuid,
  p_assessment_id uuid
) RETURNS TABLE (
  section_id uuid,
  section_key text,
  section_number text,
  section_title text
) AS $$
BEGIN
  -- First check if there are any assessment-specific mappings
  IF EXISTS (
    SELECT 1 FROM element_section_mappings
    WHERE element_group_id = p_element_group_id
    AND assessment_id = p_assessment_id
  ) THEN
    -- Use assessment-specific mappings with full section details
    RETURN QUERY
    SELECT s.id, s.key, s.number, s.title
    FROM element_section_mappings esm
    INNER JOIN sections s ON s.id = esm.section_id
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id = p_assessment_id;
  ELSE
    -- Fall back to global mappings with full section details
    RETURN QUERY
    SELECT s.id, s.key, s.number, s.title
    FROM element_section_mappings esm
    INNER JOIN sections s ON s.id = esm.section_id
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_element_sections IS 'Gets full section details for element group, checking assessment-specific first, then global defaults';


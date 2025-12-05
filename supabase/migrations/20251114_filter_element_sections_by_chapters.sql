-- Filter element sections by assessment's selected chapters
-- This ensures element instances only get sections from the chapters selected for the assessment
--
-- Example: If an assessment only selects CBC 2022 Chapter 7, door instances should only get
-- door sections from Chapter 7, not from other chapters like 11B.

CREATE OR REPLACE FUNCTION get_element_sections(
  p_element_group_id uuid,
  p_assessment_id uuid
) RETURNS TABLE (
  section_id uuid,
  section_key text,
  section_number text,
  section_title text
) AS $$
DECLARE
  v_selected_chapter_ids uuid[];
BEGIN
  -- Fetch selected chapter IDs from the assessment
  SELECT selected_chapter_ids INTO v_selected_chapter_ids
  FROM assessments
  WHERE id = p_assessment_id;

  -- If no chapters selected, return empty (fail-safe)
  -- This prevents accidentally pulling ALL sections when chapters aren't configured
  IF v_selected_chapter_ids IS NULL OR array_length(v_selected_chapter_ids, 1) = 0 THEN
    RAISE WARNING 'Assessment % has no selected chapters - returning empty section list', p_assessment_id;
    RETURN;
  END IF;

  -- First check if there are any assessment-specific mappings
  IF EXISTS (
    SELECT 1 FROM element_section_mappings
    WHERE element_group_id = p_element_group_id
    AND assessment_id = p_assessment_id
  ) THEN
    -- Use assessment-specific mappings, filtered by selected chapters
    RETURN QUERY
    SELECT s.id, s.key, s.number, s.title
    FROM element_section_mappings esm
    INNER JOIN sections s ON s.id = esm.section_id
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id = p_assessment_id
    AND s.chapter_id = ANY(v_selected_chapter_ids);  -- ← NEW: Filter by selected chapters
  ELSE
    -- Fall back to global mappings, filtered by selected chapters
    RETURN QUERY
    SELECT s.id, s.key, s.number, s.title
    FROM element_section_mappings esm
    INNER JOIN sections s ON s.id = esm.section_id
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id IS NULL
    AND s.chapter_id = ANY(v_selected_chapter_ids);  -- ← NEW: Filter by selected chapters
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_element_sections IS 
  'Gets section details for element group, filtered by assessment''s selected chapters. '
  'Checks assessment-specific mappings first, then falls back to global defaults. '
  'Returns empty if assessment has no selected chapters.';








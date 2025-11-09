-- Create function to seed all checks for an element instance in one atomic operation
-- This replaces the inefficient pattern of fetching sections then re-inserting them

CREATE OR REPLACE FUNCTION seed_element_checks(
  p_assessment_id UUID,
  p_element_group_id UUID,
  p_element_instance_id UUID,
  p_instance_label TEXT
)
RETURNS TABLE(
  checks_created INTEGER,
  sections_processed INTEGER,
  first_check_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_checks_created INTEGER;
  v_sections_processed INTEGER;
  v_first_check_id UUID;
BEGIN
  -- Insert all checks for this element instance in one operation
  WITH element_sections AS (
    -- Get all applicable sections for this element group
    SELECT section_id, section_key, section_number, section_title
    FROM get_element_sections(p_element_group_id, p_assessment_id)
    ORDER BY section_number -- Order by section number to get consistent first check
  ),
  inserted_checks AS (
    INSERT INTO checks (
      assessment_id,
      element_instance_id,
      element_group_id,
      section_id,
      check_name,
      code_section_number,
      code_section_title,
      status
    )
    SELECT
      p_assessment_id,
      p_element_instance_id,
      p_element_group_id,
      es.section_id,
      p_instance_label || ' - ' || es.section_title,
      es.section_number,
      es.section_title,
      'pending'
    FROM element_sections es
    RETURNING id, code_section_number
  )
  SELECT
    COUNT(*)::INTEGER,
    (SELECT id FROM inserted_checks ORDER BY code_section_number LIMIT 1) -- Get first by section number
  INTO v_checks_created, v_first_check_id
  FROM inserted_checks;

  -- Get total sections we tried to process
  SELECT COUNT(*)::INTEGER INTO v_sections_processed
  FROM get_element_sections(p_element_group_id, p_assessment_id);

  -- Validate that all sections were inserted
  IF v_checks_created != v_sections_processed THEN
    RAISE EXCEPTION
      'Check creation failed: Expected % checks, created %',
      v_sections_processed,
      v_checks_created;
  END IF;

  -- Return the counts and first check ID
  RETURN QUERY SELECT v_checks_created, v_sections_processed, v_first_check_id;
END;
$$;

COMMENT ON FUNCTION seed_element_checks IS
  'Creates all checks for an element instance in one atomic SQL operation. Returns counts for validation.';

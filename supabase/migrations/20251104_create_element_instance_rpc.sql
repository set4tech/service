-- RPC function to create an element instance with all its section checks
-- This is much faster than doing it in TypeScript with multiple round trips

CREATE OR REPLACE FUNCTION create_element_instance(
  p_assessment_id UUID,
  p_element_group_slug TEXT,
  p_instance_label TEXT DEFAULT NULL
)
RETURNS TABLE (
  check_id UUID,
  check_name TEXT,
  instance_label TEXT,
  element_group_name TEXT,
  sections_created INTEGER
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_element_group_id UUID;
  v_element_group_name TEXT;
  v_instance_label TEXT;
  v_sections_created INTEGER;
  v_first_check_id UUID;
  v_first_check_name TEXT;
BEGIN
  -- 1. Get element group info
  SELECT id, name INTO v_element_group_id, v_element_group_name
  FROM element_groups
  WHERE slug = p_element_group_slug;

  IF v_element_group_id IS NULL THEN
    RAISE EXCEPTION 'Element group "%" not found', p_element_group_slug;
  END IF;

  -- 2. Generate instance label if not provided
  IF p_instance_label IS NULL THEN
    -- Find next available number
    WITH existing_labels AS (
      SELECT c.instance_label
      FROM checks c
      WHERE c.assessment_id = p_assessment_id
        AND c.element_group_id = v_element_group_id
        AND c.instance_label IS NOT NULL
    ),
    numbers AS (
      SELECT 
        regexp_replace(el.instance_label, '^' || v_element_group_name || ' (\d+).*$', '\1')::integer as num
      FROM existing_labels el
      WHERE el.instance_label ~ ('^' || v_element_group_name || ' \d+')
    ),
    next_num AS (
      SELECT COALESCE(MAX(n.num) + 1, 1) as next_number
      FROM numbers n
    )
    SELECT v_element_group_name || ' ' || nn.next_number
    INTO v_instance_label
    FROM next_num nn;
  ELSE
    v_instance_label := p_instance_label;
  END IF;

  -- 3. Create all section checks in a single INSERT using get_element_sections
  WITH section_mappings AS (
    -- Get sections for this element group (uses existing RPC)
    SELECT section_key
    FROM get_element_sections(v_element_group_id, p_assessment_id)
  ),
  section_details AS (
    -- Get full section details
    SELECT s.id, s.key, s.number, s.title
    FROM sections s
    INNER JOIN section_mappings sm ON s.key = sm.section_key
  ),
  inserted_checks AS (
    -- Insert all checks
    INSERT INTO checks (
      assessment_id,
      check_name,
      section_id,
      code_section_key,
      code_section_number,
      code_section_title,
      element_group_id,
      instance_label,
      status
    )
    SELECT
      p_assessment_id,
      v_instance_label || ' - ' || sd.title,
      sd.id,
      sd.key,
      sd.number,
      sd.title,
      v_element_group_id,
      v_instance_label,
      'pending'
    FROM section_details sd
    RETURNING checks.id, checks.check_name
  )
  SELECT ic.id, ic.check_name 
  INTO v_first_check_id, v_first_check_name
  FROM inserted_checks ic
  LIMIT 1;

  -- 4. Get count of sections created
  GET DIAGNOSTICS v_sections_created = ROW_COUNT;

  -- 5. Return the first check as representative (for UI compatibility)
  RETURN QUERY
  SELECT 
    v_first_check_id,
    v_first_check_name,
    v_instance_label,
    v_element_group_name,
    v_sections_created;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION create_element_instance IS 
  'Creates an element instance with all associated section checks. Much faster than doing it in application code.';


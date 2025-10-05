-- Migration: Create child checks for each section in element instances
-- This allows per-section judgments, screenshots, and analysis within element checks

-- Function to create section checks for an element instance
CREATE OR REPLACE FUNCTION create_section_checks_for_element(element_check_id UUID)
RETURNS INTEGER AS $$
DECLARE
  element_check RECORD;
  section_key TEXT;
  section_data RECORD;
  created_count INTEGER := 0;
BEGIN
  -- Get the element check
  SELECT * INTO element_check
  FROM checks
  WHERE id = element_check_id
    AND check_type = 'element'
    AND instance_number > 0;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- For each section in element_sections array
  FOR section_key IN SELECT unnest(element_check.element_sections)
  LOOP
    -- Get section details
    SELECT key, number, title INTO section_data
    FROM sections
    WHERE key = section_key;

    IF FOUND THEN
      -- Create child check for this section
      INSERT INTO checks (
        assessment_id,
        parent_check_id,
        check_type,
        check_name,
        code_section_key,
        code_section_number,
        code_section_title,
        element_group_id,
        instance_number,
        instance_label,
        status,
        created_at,
        updated_at
      ) VALUES (
        element_check.assessment_id,
        element_check.id,
        'section', -- Child checks are section type
        element_check.instance_label || ' - ' || section_data.title,
        section_data.key,
        section_data.number,
        section_data.title,
        element_check.element_group_id,
        0, -- Section checks don't have instance numbers
        element_check.instance_label,
        'pending',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING; -- Skip if already exists

      created_count := created_count + 1;
    END IF;
  END LOOP;

  RETURN created_count;
END;
$$ LANGUAGE plpgsql;

-- Create section checks for all existing element instances
DO $$
DECLARE
  element_check RECORD;
  total_created INTEGER := 0;
  check_count INTEGER;
BEGIN
  FOR element_check IN
    SELECT id, instance_label
    FROM checks
    WHERE check_type = 'element'
      AND instance_number > 0
      AND element_sections IS NOT NULL
      AND array_length(element_sections, 1) > 0
  LOOP
    check_count := create_section_checks_for_element(element_check.id);
    total_created := total_created + check_count;

    RAISE NOTICE 'Created % section checks for element %', check_count, element_check.instance_label;
  END LOOP;

  RAISE NOTICE 'Total section checks created: %', total_created;
END $$;

-- Add index for efficient querying of child checks
CREATE INDEX IF NOT EXISTS idx_checks_parent_check_id ON checks(parent_check_id) WHERE parent_check_id IS NOT NULL;

-- Comment
COMMENT ON FUNCTION create_section_checks_for_element IS
'Creates individual section checks as children of an element instance check. Each section gets its own check row for independent judgment, screenshots, and analysis.';

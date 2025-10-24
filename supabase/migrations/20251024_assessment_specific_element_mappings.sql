-- Migration: Make element section mappings assessment-specific
-- Allows different projects/assessments to customize which sections belong to which elements

-- Step 1: Add assessment_id column (nullable)
ALTER TABLE element_section_mappings
ADD COLUMN assessment_id uuid REFERENCES assessments(id) ON DELETE CASCADE;

-- Step 2: Drop old unique constraint
ALTER TABLE element_section_mappings
DROP CONSTRAINT element_section_mappings_element_group_id_section_key_key;

-- Step 3: Add new unique constraint that handles NULL assessment_id properly
-- This ensures:
-- - Only one global mapping per (element_group, section)
-- - Only one assessment-specific mapping per (element_group, section, assessment)
CREATE UNIQUE INDEX element_section_mappings_global_unique
ON element_section_mappings (element_group_id, section_key)
WHERE assessment_id IS NULL;

CREATE UNIQUE INDEX element_section_mappings_assessment_unique
ON element_section_mappings (element_group_id, section_key, assessment_id)
WHERE assessment_id IS NOT NULL;

-- Step 4: Add index for querying by assessment
CREATE INDEX idx_element_mappings_assessment ON element_section_mappings(assessment_id);

-- Step 5: Add helper function to get sections for element group in assessment
-- This function checks assessment-specific mappings first, then falls back to global
CREATE OR REPLACE FUNCTION get_element_sections(
  p_element_group_id uuid,
  p_assessment_id uuid
) RETURNS TABLE (section_key text) AS $$
BEGIN
  -- First check if there are any assessment-specific mappings
  IF EXISTS (
    SELECT 1 FROM element_section_mappings
    WHERE element_group_id = p_element_group_id
    AND assessment_id = p_assessment_id
  ) THEN
    -- Use assessment-specific mappings
    RETURN QUERY
    SELECT esm.section_key
    FROM element_section_mappings esm
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id = p_assessment_id;
  ELSE
    -- Fall back to global mappings
    RETURN QUERY
    SELECT esm.section_key
    FROM element_section_mappings esm
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 6: Add helper function to copy global mappings to assessment
CREATE OR REPLACE FUNCTION copy_element_mappings_to_assessment(
  p_assessment_id uuid,
  p_element_group_id uuid DEFAULT NULL -- If NULL, copies all element groups
) RETURNS void AS $$
BEGIN
  INSERT INTO element_section_mappings (element_group_id, section_key, assessment_id)
  SELECT
    element_group_id,
    section_key,
    p_assessment_id
  FROM element_section_mappings
  WHERE assessment_id IS NULL
    AND (p_element_group_id IS NULL OR element_group_id = p_element_group_id)
  ON CONFLICT DO NOTHING; -- Skip if already exists
END;
$$ LANGUAGE plpgsql;

-- Step 7: Add helper function to reset assessment to global defaults
CREATE OR REPLACE FUNCTION reset_element_mappings_to_global(
  p_assessment_id uuid,
  p_element_group_id uuid DEFAULT NULL -- If NULL, resets all element groups
) RETURNS void AS $$
BEGIN
  DELETE FROM element_section_mappings
  WHERE assessment_id = p_assessment_id
    AND (p_element_group_id IS NULL OR element_group_id = p_element_group_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN element_section_mappings.assessment_id IS 'NULL for global defaults, non-NULL for assessment-specific overrides';
COMMENT ON FUNCTION get_element_sections IS 'Gets sections for element group, checking assessment-specific first, then global defaults';
COMMENT ON FUNCTION copy_element_mappings_to_assessment IS 'Copies global element mappings to assessment for customization';
COMMENT ON FUNCTION reset_element_mappings_to_global IS 'Removes assessment-specific mappings, reverting to global defaults';

-- Allow element_instances to have NULL element_group_id
-- This enables ad-hoc section instances without requiring a fake "Custom" element group

-- Step 1: Drop the NOT NULL constraint on element_group_id
ALTER TABLE element_instances 
  ALTER COLUMN element_group_id DROP NOT NULL;

-- Step 2: Modify the unique constraint to handle NULL element_group_id
-- Drop old constraint (it's a CONSTRAINT not just an INDEX)
ALTER TABLE element_instances 
  DROP CONSTRAINT IF EXISTS element_instances_assessment_id_element_group_id_label_key;

-- Create new constraints that work with NULL
-- For element-grouped instances: unique on (assessment_id, element_group_id, label)
-- For ad-hoc instances: unique on (assessment_id, label) when element_group_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS element_instances_unique_with_group
  ON element_instances (assessment_id, element_group_id, label)
  WHERE element_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS element_instances_unique_adhoc
  ON element_instances (assessment_id, label)
  WHERE element_group_id IS NULL;

-- Step 3: Update the label generation trigger to handle NULL element_group_id
CREATE OR REPLACE FUNCTION generate_element_instance_label()
RETURNS TRIGGER AS $$
DECLARE
  v_element_group_name varchar;
  v_max_number int;
BEGIN
  IF NEW.label IS NULL OR NEW.label = '' THEN
    -- For element-grouped instances, use the element group name
    IF NEW.element_group_id IS NOT NULL THEN
      SELECT name INTO v_element_group_name
      FROM element_groups WHERE id = NEW.element_group_id;
      
      SELECT COALESCE(
        MAX((regexp_match(label, '\s+(\d+)(?:\s|$)'))[1]::int),
        0
      ) INTO v_max_number
      FROM element_instances
      WHERE assessment_id = NEW.assessment_id
        AND element_group_id = NEW.element_group_id;
      
      NEW.label := v_element_group_name || ' ' || (v_max_number + 1);
    ELSE
      -- For ad-hoc instances, just use "Instance N"
      SELECT COALESCE(MAX((regexp_match(label, 'Instance (\d+)'))[1]::int), 0)
      INTO v_max_number
      FROM element_instances
      WHERE assessment_id = NEW.assessment_id
        AND element_group_id IS NULL;
      
      NEW.label := 'Instance ' || (v_max_number + 1);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN element_instances.element_group_id IS 
  'FK to element_groups. NULL for ad-hoc section instances (cloned section checks)';

-- Step 4: Update checks table constraint to use element_instance_id instead of element_group_id
-- Drop the old section-based constraint
DROP INDEX IF EXISTS idx_checks_unique_section_based;

-- Create new constraint: section checks are unique when they have NO element_instance_id
-- Checks with element_instance_id can have duplicates (that's the whole point of instances)
CREATE UNIQUE INDEX idx_checks_unique_section_based
  ON checks (assessment_id, section_id)
  WHERE element_instance_id IS NULL;

COMMENT ON INDEX idx_checks_unique_section_based IS 
  'Ensures section checks without element instances are unique per assessment. Checks with element_instance_id can be duplicated.';

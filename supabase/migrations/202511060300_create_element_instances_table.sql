-- Create element_instances table to normalize element data
-- This replaces the denormalized element_group_id + instance_label pattern in checks table

-- 1. Create the new element_instances table
CREATE TABLE element_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  element_group_id uuid NOT NULL REFERENCES element_groups(id) ON DELETE CASCADE,
  label varchar NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(assessment_id, element_group_id, label)
);

CREATE INDEX idx_element_instances_assessment_group 
  ON element_instances(assessment_id, element_group_id);

-- 2. Trigger for auto-generating labels on insert
CREATE OR REPLACE FUNCTION generate_element_instance_label()
RETURNS TRIGGER AS $$
DECLARE
  v_element_group_name varchar;
  v_max_number int;
BEGIN
  IF NEW.label IS NULL OR NEW.label = '' THEN
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_element_instance_label
  BEFORE INSERT ON element_instances
  FOR EACH ROW EXECUTE FUNCTION generate_element_instance_label();

-- 3. Add new column to checks (nullable for now, during migration)
ALTER TABLE checks 
  ADD COLUMN element_instance_id uuid REFERENCES element_instances(id) ON DELETE CASCADE;

CREATE INDEX idx_checks_element_instance ON checks(element_instance_id);

-- 4. MIGRATE EXISTING DATA
-- Create element_instances from existing checks data
INSERT INTO element_instances (assessment_id, element_group_id, label, created_at)
SELECT DISTINCT
  c.assessment_id,
  c.element_group_id,
  c.instance_label,
  MIN(c.created_at) -- Use earliest check creation time as instance creation time
FROM checks c
WHERE c.element_group_id IS NOT NULL
  AND c.instance_label IS NOT NULL
  AND c.instance_label != ''
GROUP BY c.assessment_id, c.element_group_id, c.instance_label
ON CONFLICT (assessment_id, element_group_id, label) DO NOTHING;

-- 5. Update checks to reference the new element_instances
UPDATE checks c
SET element_instance_id = ei.id
FROM element_instances ei
WHERE c.assessment_id = ei.assessment_id
  AND c.element_group_id = ei.element_group_id
  AND c.instance_label = ei.label
  AND c.element_group_id IS NOT NULL
  AND c.instance_label IS NOT NULL;

-- 6. Verify migration (should return 0)
DO $$
DECLARE
  v_unmigrated_count int;
  v_instance_count int;
  v_old_grouping_count int;
BEGIN
  -- Count checks that couldn't be migrated
  SELECT COUNT(*) INTO v_unmigrated_count
  FROM checks
  WHERE element_group_id IS NOT NULL
    AND instance_label IS NOT NULL
    AND element_instance_id IS NULL;
  
  -- Count instances created
  SELECT COUNT(*) INTO v_instance_count FROM element_instances;
  
  -- Count unique old groupings
  SELECT COUNT(DISTINCT (assessment_id, element_group_id, instance_label)) INTO v_old_grouping_count
  FROM checks
  WHERE element_group_id IS NOT NULL
    AND instance_label IS NOT NULL;
  
  IF v_unmigrated_count > 0 THEN
    RAISE WARNING 'Found % checks that could not be migrated to element_instances', v_unmigrated_count;
  ELSE
    RAISE NOTICE 'All element checks successfully migrated to element_instances';
  END IF;
  
  RAISE NOTICE 'Created % element instances from % unique groupings', v_instance_count, v_old_grouping_count;
END $$;

-- 7. Add comments
COMMENT ON TABLE element_instances IS 'Physical element instances (e.g., "Door 1", "Bathroom 2") that group related section checks';
COMMENT ON COLUMN element_instances.label IS 'User-facing label, auto-generated if not provided (e.g., "Door 1")';
COMMENT ON COLUMN checks.element_instance_id IS 'Links section checks to their parent element instance';

-- NOTE: Old columns (element_group_id, instance_label) will be dropped in a future migration
-- after all code has been updated to use element_instance_id



-- Fix checks and element_section_mappings to use updated section keys
-- The 20250930_split_11a_11b.sql migration updated sections but not checks
-- This migration updates checks.code_section_key to match the new section keys

-- Step 1: Drop the foreign key constraints temporarily (not deferrable, so must drop)
ALTER TABLE checks DROP CONSTRAINT IF EXISTS checks_code_section_key_fkey;
ALTER TABLE element_section_mappings DROP CONSTRAINT IF EXISTS element_section_mappings_section_key_fkey;
ALTER TABLE element_section_mappings DROP CONSTRAINT IF EXISTS element_group_section_mappings_section_key_fkey;

-- Step 2: Update checks for 11A sections
UPDATE checks
SET
  code_section_key = REPLACE(code_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A'),
  updated_at = NOW()
WHERE code_section_key LIKE '%CBC_Chapter11A_11B%'
  AND code_section_key LIKE '%:11A-%';

-- Step 3: Update checks for 11B sections
UPDATE checks
SET
  code_section_key = REPLACE(code_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B'),
  updated_at = NOW()
WHERE code_section_key LIKE '%CBC_Chapter11A_11B%'
  AND code_section_key LIKE '%:11B-%';

-- Step 4: Update element_section_mappings for 11A sections
UPDATE element_section_mappings
SET
  section_key = REPLACE(section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A')
WHERE section_key LIKE '%CBC_Chapter11A_11B%'
  AND section_key LIKE '%:11A-%';

-- Step 5: Update element_section_mappings for 11B sections
UPDATE element_section_mappings
SET
  section_key = REPLACE(section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B')
WHERE section_key LIKE '%CBC_Chapter11A_11B%'
  AND section_key LIKE '%:11B-%';

-- Step 6: Re-add the foreign key constraints
ALTER TABLE checks
  ADD CONSTRAINT checks_code_section_key_fkey
  FOREIGN KEY (code_section_key)
  REFERENCES sections(key)
  ON DELETE CASCADE;

-- The table might have either constraint name depending on migration history
DO $$
BEGIN
  -- Try to add the constraint with the original name
  BEGIN
    ALTER TABLE element_section_mappings
      ADD CONSTRAINT element_section_mappings_section_key_fkey
      FOREIGN KEY (section_key)
      REFERENCES sections(key)
      ON DELETE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Constraint already exists
  END;
  
  -- Also try with the alternate name
  BEGIN
    ALTER TABLE element_section_mappings
      ADD CONSTRAINT element_group_section_mappings_section_key_fkey
      FOREIGN KEY (section_key)
      REFERENCES sections(key)
      ON DELETE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Constraint already exists
  END;
END $$;

-- Step 7: Log how many records were updated
DO $$
DECLARE
  checks_updated_count INTEGER;
  mappings_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO checks_updated_count
  FROM checks
  WHERE code_section_key LIKE '%CBC_Chapter11B%'
    AND code_section_key LIKE '%:11B-%';
  
  SELECT COUNT(*) INTO mappings_updated_count
  FROM element_section_mappings
  WHERE section_key LIKE '%CBC_Chapter11B%'
    AND section_key LIKE '%:11B-%';
  
  RAISE NOTICE 'Updated % checks with new section keys', checks_updated_count;
  RAISE NOTICE 'Updated % element_section_mappings with new section keys', mappings_updated_count;
END $$;


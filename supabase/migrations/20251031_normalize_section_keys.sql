-- Migration: Normalize all section keys to standard format
-- Format: provider:source_id:version[:jurisdiction]:number
-- Example: ICC:CBC_Chapter11A_11B:2025:CA:11B-201.4

BEGIN;

-- Step 1: Temporarily disable constraints and triggers for performance
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE sections DISABLE TRIGGER ALL;
ALTER TABLE checks DISABLE TRIGGER ALL;
ALTER TABLE section_references DISABLE TRIGGER ALL;
ALTER TABLE element_section_mappings DISABLE TRIGGER ALL;
ALTER TABLE section_applicability_log DISABLE TRIGGER ALL;
ALTER TABLE section_checks DISABLE TRIGGER ALL;

-- Step 2: Create temporary mapping table
CREATE TEMP TABLE temp_key_mapping (
  old_key TEXT PRIMARY KEY,
  new_key TEXT NOT NULL UNIQUE,
  code_id TEXT NOT NULL,
  number TEXT NOT NULL
);

-- Step 3: Populate mapping by reconstructing correct keys from code_id
-- Parse code_id format: provider+source_id+version[+jurisdiction]
-- Construct key format: provider:source_id:version[:jurisdiction]:number
INSERT INTO temp_key_mapping (old_key, new_key, code_id, number)
SELECT 
  s.key as old_key,
  CASE 
    -- Parse code_id: split on '+' and reconstruct with ':'
    WHEN array_length(string_to_array(s.code_id, '+'), 1) = 4 THEN
      -- Has jurisdiction: provider+source_id+version+jurisdiction
      (string_to_array(s.code_id, '+'))[1] || ':' ||
      (string_to_array(s.code_id, '+'))[2] || ':' ||
      (string_to_array(s.code_id, '+'))[3] || ':' ||
      (string_to_array(s.code_id, '+'))[4] || ':' ||
      s.number
    WHEN array_length(string_to_array(s.code_id, '+'), 1) = 3 THEN
      -- No jurisdiction: provider+source_id+version
      (string_to_array(s.code_id, '+'))[1] || ':' ||
      (string_to_array(s.code_id, '+'))[2] || ':' ||
      (string_to_array(s.code_id, '+'))[3] || ':' ||
      s.number
    ELSE
      -- Fallback for unexpected format
      s.code_id || ':' || s.number
  END as new_key,
  s.code_id,
  s.number
FROM sections s
WHERE s.key != CASE 
    WHEN array_length(string_to_array(s.code_id, '+'), 1) = 4 THEN
      (string_to_array(s.code_id, '+'))[1] || ':' ||
      (string_to_array(s.code_id, '+'))[2] || ':' ||
      (string_to_array(s.code_id, '+'))[3] || ':' ||
      (string_to_array(s.code_id, '+'))[4] || ':' ||
      s.number
    WHEN array_length(string_to_array(s.code_id, '+'), 1) = 3 THEN
      (string_to_array(s.code_id, '+'))[1] || ':' ||
      (string_to_array(s.code_id, '+'))[2] || ':' ||
      (string_to_array(s.code_id, '+'))[3] || ':' ||
      s.number
    ELSE
      s.code_id || ':' || s.number
  END;

-- Log how many keys need to be updated
DO $$
DECLARE
  key_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO key_count FROM temp_key_mapping;
  RAISE NOTICE 'Found % section keys that need to be normalized', key_count;
END $$;

-- Step 4: Update all foreign key references in dependent tables
-- Order matters: update child references before parent keys

-- 4.1: Update section_references (both source and target)
UPDATE section_references sr
SET source_section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE sr.source_section_key = tkm.old_key;

UPDATE section_references sr
SET target_section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE sr.target_section_key = tkm.old_key;

-- 4.2: Update section_applicability_log
UPDATE section_applicability_log sal
SET section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE sal.section_key = tkm.old_key;

-- 4.3: Update element_section_mappings
UPDATE element_section_mappings esm
SET section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE esm.section_key = tkm.old_key;

-- 4.4: Update checks
UPDATE checks c
SET code_section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE c.code_section_key = tkm.old_key;

-- 4.5: Update section_checks (compliance viewer)
UPDATE section_checks sc
SET section_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE sc.section_key = tkm.old_key;

-- 4.6: Update sections.parent_key (self-reference)
UPDATE sections s
SET parent_key = tkm.new_key
FROM temp_key_mapping tkm
WHERE s.parent_key = tkm.old_key;

-- Step 5: Update sections.key (primary column)
-- This must be done AFTER all FK references are updated
UPDATE sections s
SET key = tkm.new_key
FROM temp_key_mapping tkm
WHERE s.key = tkm.old_key;

-- Step 6: Re-enable triggers and constraints
ALTER TABLE sections ENABLE TRIGGER ALL;
ALTER TABLE checks ENABLE TRIGGER ALL;
ALTER TABLE section_references ENABLE TRIGGER ALL;
ALTER TABLE element_section_mappings ENABLE TRIGGER ALL;
ALTER TABLE section_applicability_log ENABLE TRIGGER ALL;
ALTER TABLE section_checks ENABLE TRIGGER ALL;
SET CONSTRAINTS ALL IMMEDIATE;

-- Step 7: Validation
DO $$
DECLARE
  invalid_format_count INTEGER;
  orphaned_checks_count INTEGER;
  orphaned_mappings_count INTEGER;
  orphaned_refs_source INTEGER;
  orphaned_refs_target INTEGER;
  orphaned_parent_count INTEGER;
BEGIN
  RAISE NOTICE '=== Validation ===';
  
  -- Check for keys that don't match expected format
  SELECT COUNT(*) INTO invalid_format_count
  FROM sections 
  WHERE key !~ '^[^:]+:[^:]+:[^:]+:([^:]+:)?[^:]+$';
  
  IF invalid_format_count > 0 THEN
    RAISE WARNING 'Found % sections with invalid key format', invalid_format_count;
  ELSE
    RAISE NOTICE '✓ All section keys match expected format';
  END IF;

  -- Check for orphaned FK references
  SELECT COUNT(*) INTO orphaned_checks_count
  FROM checks 
  WHERE code_section_key IS NOT NULL 
    AND code_section_key NOT IN (SELECT key FROM sections);
  
  IF orphaned_checks_count > 0 THEN
    RAISE WARNING 'Found % orphaned checks references', orphaned_checks_count;
  ELSE
    RAISE NOTICE '✓ No orphaned checks references';
  END IF;

  SELECT COUNT(*) INTO orphaned_mappings_count
  FROM element_section_mappings 
  WHERE section_key NOT IN (SELECT key FROM sections);
  
  IF orphaned_mappings_count > 0 THEN
    RAISE WARNING 'Found % orphaned element mapping references', orphaned_mappings_count;
  ELSE
    RAISE NOTICE '✓ No orphaned element mapping references';
  END IF;

  SELECT COUNT(*) INTO orphaned_refs_source
  FROM section_references 
  WHERE source_section_key NOT IN (SELECT key FROM sections);
  
  IF orphaned_refs_source > 0 THEN
    RAISE WARNING 'Found % orphaned section_references (source)', orphaned_refs_source;
  ELSE
    RAISE NOTICE '✓ No orphaned section_references (source)';
  END IF;

  SELECT COUNT(*) INTO orphaned_refs_target
  FROM section_references 
  WHERE target_section_key NOT IN (SELECT key FROM sections);
  
  IF orphaned_refs_target > 0 THEN
    RAISE WARNING 'Found % orphaned section_references (target)', orphaned_refs_target;
  ELSE
    RAISE NOTICE '✓ No orphaned section_references (target)';
  END IF;

  SELECT COUNT(*) INTO orphaned_parent_count
  FROM sections 
  WHERE parent_key IS NOT NULL 
    AND parent_key NOT IN (SELECT key FROM sections);
  
  IF orphaned_parent_count > 0 THEN
    RAISE WARNING 'Found % orphaned parent_key references', orphaned_parent_count;
  ELSE
    RAISE NOTICE '✓ No orphaned parent_key references';
  END IF;

  RAISE NOTICE '=== Migration Complete ===';
END $$;

-- Drop temporary table
DROP TABLE temp_key_mapping;

COMMIT;


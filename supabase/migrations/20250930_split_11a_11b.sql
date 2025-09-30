-- Split CBC Chapter 11A and 11B into separate codes
-- This allows users to select them independently in the project flow

-- Step 1: Create separate code records for 11A and 11B
INSERT INTO codes (id, provider, source_id, version, jurisdiction, title, source_url)
VALUES
  (
    'ICC+CBC_Chapter11A+2025+CA',
    'ICC',
    'CBC_Chapter11A',
    '2025',
    'CA',
    'California Building Code - Chapter 11A Accessibility',
    ''
  ),
  (
    'ICC+CBC_Chapter11B+2025+CA',
    'ICC',
    'CBC_Chapter11B',
    '2025',
    'CA',
    'California Building Code - Chapter 11B Accessibility',
    ''
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  updated_at = NOW();

-- Step 2: Update sections that belong to Chapter 11A
UPDATE sections
SET
  code_id = 'ICC+CBC_Chapter11A+2025+CA',
  key = REPLACE(key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A'),
  updated_at = NOW()
WHERE code_id = 'ICC+CBC_Chapter11A_11B+2025+CA'
  AND number LIKE '11A-%';

-- Step 3: Update sections that belong to Chapter 11B
UPDATE sections
SET
  code_id = 'ICC+CBC_Chapter11B+2025+CA',
  key = REPLACE(key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B'),
  updated_at = NOW()
WHERE code_id = 'ICC+CBC_Chapter11A_11B+2025+CA'
  AND number LIKE '11B-%';

-- Step 4: Update parent_key references for 11A sections
UPDATE sections
SET
  parent_key = REPLACE(parent_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A'),
  updated_at = NOW()
WHERE parent_key LIKE '%CBC_Chapter11A_11B%'
  AND number LIKE '11A-%';

-- Step 5: Update parent_key references for 11B sections
UPDATE sections
SET
  parent_key = REPLACE(parent_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B'),
  updated_at = NOW()
WHERE parent_key LIKE '%CBC_Chapter11A_11B%'
  AND number LIKE '11B-%';

-- Step 6: Update section_references for 11A sections
UPDATE section_references
SET
  source_section_key = REPLACE(source_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A'),
  target_section_key = REPLACE(target_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11A')
WHERE source_section_key LIKE '%:11A-%'
  OR target_section_key LIKE '%:11A-%';

-- Step 7: Update section_references for 11B sections
UPDATE section_references
SET
  source_section_key = REPLACE(source_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B'),
  target_section_key = REPLACE(target_section_key, 'CBC_Chapter11A_11B', 'CBC_Chapter11B')
WHERE source_section_key LIKE '%:11B-%'
  OR target_section_key LIKE '%:11B-%';

-- Step 8: Optionally delete the combined code (comment out if you want to keep it)
-- DELETE FROM codes WHERE id = 'ICC+CBC_Chapter11A_11B+2025+CA';

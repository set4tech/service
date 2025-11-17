-- Create a test violation with calculation table for project 6922c5c9-470e-4ce2-84e6-ca811ddedc78

-- Step 1: Insert a new check
INSERT INTO checks (
  assessment_id,
  section_id,
  code_section_number,
  code_section_title,
  check_name,
  manual_status,
  human_readable_title,
  calculation_table
) VALUES (
  '6922c5c9-470e-4ce2-84e6-ca811ddedc78',
  -- Get a section ID for door requirements
  (SELECT id FROM sections WHERE number = '404.2.3' AND code_id LIKE '%11B%' LIMIT 1),
  '11B-404.2.3',
  'Clear Width',
  'Door Clear Width - Entrance',
  'non_compliant',
  'Entrance door width insufficient',
  '{
    "title": "Door Clear Width Calculation",
    "headers": ["Location", "Required (inches)", "Measured (inches)", "Deficit (inches)", "Status"],
    "rows": [
      ["Main Entrance", "32", "28", "-4", "❌ Non-compliant"],
      ["Clear Opening Width", "32", "28", "-4", "❌ Non-compliant"],
      ["Door Leaf Width", "36", "32", "-4", "⚠️ Below minimum"],
      ["Hardware Projection", "0 deducted", "2 deducted", "+2", "❌ Reduces clearance"]
    ]
  }'::jsonb
) RETURNING id;

-- Step 2: Get the check ID we just created
DO $$
DECLARE
  new_check_id UUID;
BEGIN
  -- Get the ID of the check we just created
  SELECT id INTO new_check_id 
  FROM checks 
  WHERE assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
    AND code_section_number = '11B-404.2.3'
    AND manual_status = 'non_compliant'
  ORDER BY created_at DESC 
  LIMIT 1;

  -- Insert a mock screenshot for this check (so it shows up in the report)
  INSERT INTO screenshots (
    project_id,
    page_number,
    screenshot_url,
    thumbnail_url,
    crop_coordinates
  ) VALUES (
    '6922c5c9-470e-4ce2-84e6-ca811ddedc78',
    1,
    's3://example-bucket/test-door-screenshot.png',
    's3://example-bucket/test-door-thumbnail.png',
    jsonb_build_object(
      'x', 100,
      'y', 200,
      'width', 300,
      'height', 400,
      'zoom_level', 1
    )
  ) RETURNING id INTO STRICT new_check_id; -- Reuse variable for screenshot id

  -- Link the screenshot to the check
  INSERT INTO screenshot_check_assignments (
    screenshot_id,
    check_id
  ) VALUES (
    new_check_id, -- screenshot id
    (SELECT id FROM checks WHERE assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78' AND code_section_number = '11B-404.2.3' ORDER BY created_at DESC LIMIT 1)
  );

  RAISE NOTICE 'Created check with calculation table and screenshot!';
END $$;

-- Step 3: Verify it was created
SELECT 
  c.id,
  c.code_section_number,
  c.human_readable_title,
  c.manual_status,
  c.calculation_table->>'title' as table_title,
  jsonb_array_length(c.calculation_table->'rows') as row_count
FROM checks c
WHERE c.assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
  AND c.code_section_number = '11B-404.2.3'
ORDER BY c.created_at DESC
LIMIT 1;


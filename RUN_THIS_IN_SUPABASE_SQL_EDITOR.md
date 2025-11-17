# Run This Migration

## Instructions

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/prafecmdqiwgnsumlmqn
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the SQL below
5. Click "Run" or press Cmd/Ctrl + Enter

## The SQL to Run

```sql
-- Step 1: Add calculation_table column to checks
ALTER TABLE checks
ADD COLUMN IF NOT EXISTS calculation_table JSONB DEFAULT NULL;

-- Step 2: Add index
CREATE INDEX IF NOT EXISTS idx_checks_calculation_table
ON checks ((calculation_table IS NOT NULL))
WHERE calculation_table IS NOT NULL;

-- Step 3: Add comment
COMMENT ON COLUMN checks.calculation_table IS
'Stores calculation tables for specific checks. Format: { title: string, headers: string[], rows: string[][] }';

-- Step 4: Drop and recreate function
DROP FUNCTION IF EXISTS get_assessment_report(uuid);

CREATE OR REPLACE FUNCTION get_assessment_report(assessment_uuid UUID)
RETURNS TABLE (
  project_name TEXT,
  pdf_url TEXT,
  building_params JSONB,
  project_id UUID,
  assessment_id UUID,
  check_id UUID,
  check_name TEXT,
  code_section_key TEXT,
  code_section_number TEXT,
  code_section_title TEXT,
  manual_status TEXT,
  is_excluded BOOLEAN,
  human_readable_title TEXT,
  instance_label TEXT,
  element_group_name TEXT,
  element_group_id UUID,
  compliance_status TEXT,
  ai_reasoning TEXT,
  confidence TEXT,
  raw_ai_response TEXT,
  violations JSONB,
  recommendations JSONB,
  screenshots JSONB,
  source_url TEXT,
  section_number TEXT,
  parent_source_url TEXT,
  code_id TEXT,
  code_title TEXT,
  code_year TEXT,
  code_source_url TEXT,
  effective_status TEXT,
  calculation_table JSONB
) AS $$
with latest_analysis as (
    SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,
    compliance_status,
    confidence,
    ai_provider,
    ai_model,
    ai_reasoning,
    violations,
    compliant_aspects,
    recommendations,
    additional_evidence_needed,
    raw_ai_response,
    executed_at,
    execution_time_ms,
    section_results,
    batch_group_id,
    batch_number,
    total_batches,
    section_keys_in_batch
  FROM public.analysis_runs
  ORDER BY check_id, run_number DESC
),
check_screenshots as (
  SELECT
    sca.check_id,
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'screenshot_url', s.screenshot_url,
        'thumbnail_url', s.thumbnail_url,
        'page_number', s.page_number,
        'crop_coordinates', s.crop_coordinates
      )
    ) FILTER (WHERE s.id IS NOT NULL) as screenshots
  FROM public.screenshot_check_assignments sca
  JOIN public.screenshots s ON s.id = sca.screenshot_id
  GROUP BY sca.check_id
)
SELECT
  p.name,
  p.pdf_url,
  p.extracted_variables,
  p.id,
  a.id,
  c.id,
  c.check_name,
  sec.key,
  c.code_section_number,
  c.code_section_title,
  c.manual_status,
  c.is_excluded,
  c.human_readable_title,
  c.instance_label,
  eg.name as element_group_name,
  c.element_group_id,
  ar.compliance_status,
  ar.ai_reasoning,
  ar.confidence,
  ar.raw_ai_response,
  ar.violations,
  ar.recommendations,
  cs.screenshots,
  sec.source_url,
  sec.number,
  parent_sec.source_url,
  code.id,
  code.title,
  code.year,
  code.source_url,
  coalesce(c.manual_status, ar.compliance_status) as effective_status,
  c.calculation_table
FROM assessments a
JOIN projects p on p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN codes code ON code.id = sec.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS false
  AND c.manual_status NOT IN ('not_applicable', 'compliant')
  AND ((c.manual_status IN ('non_compliant', 'insufficient_information')
       OR ar.compliance_status IN ('non_compliant', 'needs_more_info')))

ORDER BY c.id

$$ LANGUAGE sql STABLE;

-- Step 5: Add example calculation table to YOUR project
UPDATE checks
SET calculation_table = '{
  "title": "Door Clearance Calculation",
  "headers": ["Measurement", "Required (inches)", "Provided (inches)", "Status"],
  "rows": [
    ["Door Width", "32", "30", "❌ Non-compliant"],
    ["Door Height", "80", "84", "✅ Compliant"],
    ["Threshold Height", "0.5 max", "0.25", "✅ Compliant"],
    ["Latch Side Clear Width", "18 min", "16", "❌ Non-compliant"],
    ["Maneuvering Depth", "60 min", "62", "✅ Compliant"]
  ]
}'::jsonb
WHERE id = (
  SELECT id
  FROM checks
  WHERE assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
    AND manual_status = 'non_compliant'
  LIMIT 1
);

-- Verify it worked
SELECT
  c.id,
  c.code_section_number,
  c.calculation_table
FROM checks c
WHERE c.assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
  AND c.calculation_table IS NOT NULL;
```

## After Running

1. You should see a success message
2. The verification query at the end will show the check with the calculation table
3. Go to: http://localhost:3000/projects/6922c5c9-470e-4ce2-84e6-ca811ddedc78/report
4. Click on any violation to open the modal
5. Scroll down - you should see the "📊 Door Clearance Calculation" table!

## What It Does

- Adds `calculation_table` column to `checks` table
- Updates the `get_assessment_report()` function to include calculation tables
- Adds an example calculation table to one non-compliant check in your project
- The table will show up in the violation detail modal

Done! 🎉

---

## Alternative: Create a Brand New Violation with Calculation Table

If you want to create a completely new test violation instead of adding to existing one:

**Copy and run this SQL:**

```sql
-- Create a test violation with calculation table

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
  (SELECT id FROM sections WHERE number = '404.2.3' AND code_id LIKE '%11B%' LIMIT 1),
  '11B-404.2.3',
  'Clear Width',
  'Door Clear Width - Main Entrance',
  'non_compliant',
  'Main entrance door width is 4 inches too narrow',
  '{
    "title": "Door Clear Width Calculation",
    "headers": ["Location", "Required (in)", "Measured (in)", "Deficit (in)", "Status"],
    "rows": [
      ["Main Entrance", "32", "28", "-4", "❌ Non-compliant"],
      ["Clear Opening", "32", "28", "-4", "❌ Fails requirement"],
      ["Door Leaf", "36", "32", "-4", "⚠️ Below minimum"],
      ["Hardware Projection", "0", "2", "+2", "❌ Reduces width"]
    ]
  }'::jsonb
);

-- Step 2: Create a mock screenshot
WITH new_screenshot AS (
  INSERT INTO screenshots (
    project_id,
    page_number,
    screenshot_url,
    thumbnail_url,
    crop_coordinates
  ) VALUES (
    '6922c5c9-470e-4ce2-84e6-ca811ddedc78',
    1,
    's3://test/door-width-violation.png',
    's3://test/door-width-thumb.png',
    '{"x": 100, "y": 200, "width": 300, "height": 400, "zoom_level": 1}'::jsonb
  )
  RETURNING id
)
INSERT INTO screenshot_check_assignments (screenshot_id, check_id)
SELECT
  new_screenshot.id,
  c.id
FROM new_screenshot, checks c
WHERE c.assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
  AND c.code_section_number = '11B-404.2.3'
  AND c.manual_status = 'non_compliant'
ORDER BY c.created_at DESC
LIMIT 1;

-- Verify
SELECT
  c.id,
  c.code_section_number,
  c.human_readable_title,
  c.calculation_table->>'title' as table_title
FROM checks c
WHERE c.assessment_id = '6922c5c9-470e-4ce2-84e6-ca811ddedc78'
  AND c.code_section_number = '11B-404.2.3'
ORDER BY c.created_at DESC
LIMIT 1;
```

This creates a brand new violation for **Door Clear Width (11B-404.2.3)** with a calculation table showing why the 28-inch door fails the 32-inch requirement.

-- Migration: Add calculation_table column to checks table and update RPC function
-- This stores check-specific calculation tables that show compliance calculations

-- Step 1: Add calculation_table column to checks
ALTER TABLE checks 
ADD COLUMN IF NOT EXISTS calculation_table JSONB DEFAULT NULL;

-- Add index for checks with calculation tables
CREATE INDEX IF NOT EXISTS idx_checks_calculation_table 
ON checks ((calculation_table IS NOT NULL)) 
WHERE calculation_table IS NOT NULL;

COMMENT ON COLUMN checks.calculation_table IS 
'Stores calculation tables for specific checks. Format: { title: string, headers: string[], rows: string[][] }
Example: {
  "title": "Door Clearance Calculation",
  "headers": ["Measurement", "Required", "Provided", "Status"],
  "rows": [
    ["Width", "32 inches", "30 inches", "❌ Non-compliant"],
    ["Height", "80 inches", "84 inches", "✅ Compliant"]
  ]
}';

-- Step 2: Update get_assessment_report RPC to include calculation_table`
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

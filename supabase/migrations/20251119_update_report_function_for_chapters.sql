-- Update get_assessment_report to use chapters → codes instead of sections.code_id
-- This aligns with the removal of sections.code_id column

-- Drop the old function first (signature is changing)
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
  compli  ance_status TEXT,
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
WITH latest_analysis AS (
    SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,the 
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
check_screenshots AS (
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
    ) FILTER (WHERE s.id IS NOT NULL) AS screenshots
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
  eg.name AS element_group_name,
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
  code.id,            -- code info now comes through chapters
  code.title,
  code.year,
  code.source_url,
  COALESCE(c.manual_status, ar.compliance_status) AS effective_status,
  c.calculation_table
FROM assessments a
JOIN projects p ON p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN chapters ch ON ch.id = sec.chapter_id  -- NEW: Go through chapters
LEFT JOIN codes code ON code.id = ch.code_id     -- NEW: Get code from chapter

WHERE a.id = assessment_uuid
  AND c.is_excluded IS FALSE
  -- Include checks with NULL manual_status, let AI analysis determine violations
  AND (c.manual_status IS NULL OR c.manual_status NOT IN ('not_applicable', 'compliant'))
  AND (
    (c.manual_status IN ('non_compliant', 'insufficient_information'))
    OR (ar.compliance_status IN ('non_compliant', 'needs_more_info'))
  )

ORDER BY c.id

$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_assessment_report IS
'Fetches violation report data for an assessment. Returns checks that are non-compliant or need more info,
including checks with NULL manual_status that rely on AI analysis. Uses chapters → codes relationship.';


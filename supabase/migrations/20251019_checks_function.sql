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
  check_type TEXT,
  instance_label TEXT,
  element_group_name TEXT,
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
  code_version TEXT,
  code_source_url TEXT,
  effective_status TEXT
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
-- New CTE to aggregate screenshots for each check
check_screenshots as (
  SELECT
    sca.check_id,
    -- Aggregate screenshot details into a JSONB array of objects
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
  c.code_section_key,
  c.code_section_number,
  c.code_section_title,
  c.manual_status,
  c.is_excluded,
  c.human_readable_title,
  c.check_type,
  c.instance_label,
  eg.name,
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
  code.version,
  code.source_url,
  coalesce(c.manual_status, ar.compliance_status) as effective_status
FROM assessments a
JOIN projects p on p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.key = c.code_section_key
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN codes code ON code.id = sec.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS false
  AND ((manual_status IN ('non_compliant', 'insufficient_information'))
       OR compliance_status IN ('non_compliant', 'needs_more_info'))

ORDER BY ar.check_id
$$ LANGUAGE sql STABLE;
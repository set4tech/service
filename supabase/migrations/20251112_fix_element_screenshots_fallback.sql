-- Fix get_assessment_report to not use element_group screenshots fallback for element instance checks
-- This was causing all screenshots for an element group to show up for each check

CREATE OR REPLACE FUNCTION public.get_assessment_report(assessment_uuid uuid)
RETURNS TABLE(
  project_name text,
  pdf_url text,
  building_params jsonb,
  project_id uuid,
  assessment_id uuid,
  check_id uuid,
  check_name text,
  code_section_key text,
  code_section_number text,
  code_section_title text,
  manual_status text,
  is_excluded boolean,
  human_readable_title text,
  instance_label text,
  element_group_name text,
  element_group_id uuid,
  compliance_status text,
  ai_reasoning text,
  confidence text,
  raw_ai_response text,
  violations jsonb,
  recommendations jsonb,
  screenshots jsonb,
  source_url text,
  section_number text,
  parent_source_url text,
  code_id text,
  code_title text,
  code_year text,
  code_source_url text,
  effective_status text
)
LANGUAGE sql
STABLE
AS $function$
WITH latest_analysis AS (
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
-- Aggregate screenshots for each check via check assignments (primary source)
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
      ORDER BY s.page_number, s.created_at
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
  ei.label,
  COALESCE(eg_direct.name, eg_via_instance.name) AS element_group_name,
  COALESCE(c.element_group_id, ei.element_group_id) AS element_group_id,
  ar.compliance_status,
  ar.ai_reasoning,
  ar.confidence,
  ar.raw_ai_response,
  ar.violations,
  ar.recommendations,
  -- Only use check-specific screenshots (no fallback for element instances)
  cs.screenshots,
  sec.source_url,
  sec.number,
  parent_sec.source_url,
  code.id,
  code.title,
  code.year,
  code.source_url,
  -- Effective status: manual_status > AI status
  COALESCE(c.manual_status, ar.compliance_status) AS effective_status
FROM public.assessments a
JOIN public.projects p ON p.id = a.project_id
JOIN public.checks c ON c.assessment_id = a.id
LEFT JOIN public.element_instances ei ON ei.id = c.element_instance_id
LEFT JOIN public.element_groups eg_direct ON eg_direct.id = c.element_group_id
LEFT JOIN public.element_groups eg_via_instance ON eg_via_instance.id = ei.element_group_id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN codes code ON code.id = sec.code_id
WHERE a.id = assessment_uuid
  AND c.is_excluded IS FALSE
  AND (c.manual_status IS NULL OR c.manual_status NOT IN ('not_applicable', 'compliant'))
  AND (
    (c.manual_status IN ('non_compliant', 'insufficient_information'))
    OR (ar.compliance_status IN ('non_compliant', 'needs_more_info'))
  )
ORDER BY c.id;
$function$;

COMMENT ON FUNCTION get_assessment_report IS
'Fetches violation report data for an assessment. Removed element_group screenshots fallback to fix bug where all element group screenshots showed up for each check.';

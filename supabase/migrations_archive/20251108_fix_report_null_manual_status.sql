-- Fix get_assessment_report to properly handle NULL manual_status
-- The issue: NOT IN with NULL values returns NULL (not TRUE), filtering out those rows
-- Solution: Use explicit NULL handling instead of NOT IN

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
-- Aggregate screenshots for each check via check assignments
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
),
-- Aggregate screenshots for element groups (for element instance checks)
-- This allows element-based violations to show screenshots even when they're only
-- tagged with element_group_id and not explicitly assigned to the check
element_group_screenshots as (
  SELECT
    s.element_group_id,
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'screenshot_url', s.screenshot_url,
        'thumbnail_url', s.thumbnail_url,
        'page_number', s.page_number,
        'crop_coordinates', s.crop_coordinates
      )
      ORDER BY s.page_number, s.created_at
    ) FILTER (WHERE s.id IS NOT NULL) as screenshots
  FROM public.screenshots s
  WHERE s.element_group_id IS NOT NULL
  GROUP BY s.element_group_id
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
  COALESCE(eg_direct.name, eg_via_instance.name) as element_group_name,
  COALESCE(c.element_group_id, ei.element_group_id) as element_group_id,
  ar.compliance_status,
  ar.ai_reasoning,
  ar.confidence,
  ar.raw_ai_response,
  ar.violations,
  ar.recommendations,
  -- Use element group screenshots if no check-specific screenshots exist
  -- This is the key change: COALESCE falls back to element_group screenshots
  COALESCE(cs.screenshots, egs.screenshots) as screenshots,
  sec.source_url,
  sec.number,
  parent_sec.source_url,
  code.id,
  code.title,
  code.year,
  code.source_url,
  coalesce(c.manual_status, ar.compliance_status) as effective_status
FROM assessments a
JOIN projects p on p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_instances ei ON c.element_instance_id = ei.id
LEFT JOIN element_groups eg_direct ON c.element_group_id = eg_direct.id
LEFT JOIN element_groups eg_via_instance ON ei.element_group_id = eg_via_instance.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
-- Join element group screenshots for fallback
LEFT JOIN element_group_screenshots egs ON egs.element_group_id = COALESCE(c.element_group_id, ei.element_group_id)
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN codes code ON code.id = sec.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS false
  -- Fix: Explicitly handle NULL manual_status instead of using NOT IN
  AND (c.manual_status IS NULL OR c.manual_status NOT IN ('not_applicable', 'compliant'))
  AND ((c.manual_status IN ('non_compliant', 'insufficient_information')
       OR ar.compliance_status IN ('non_compliant', 'needs_more_info')))

ORDER BY c.id

$function$;

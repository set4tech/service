-- Update RPC functions to include agent_analysis_runs alongside analysis_runs
-- This ensures agent assessment results appear in reports and progress tracking

-- ============================================================================
-- 1. Update get_assessment_report to UNION agent runs
-- ============================================================================

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
  calculation_table JSONB,
  analysis_source TEXT  -- NEW: 'ai' or 'agent' to indicate source
) AS $$
WITH latest_analysis AS (
  -- Get latest from BOTH tables, prefer most recent
  SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,
    compliance_status,
    confidence,
    ai_reasoning,
    violations,
    recommendations,
    raw_ai_response,
    executed_at,
    'ai' as source
  FROM (
    -- Regular AI runs
    SELECT id, check_id, run_number, compliance_status, confidence,
           ai_reasoning, violations, recommendations, raw_ai_response,
           executed_at
    FROM public.analysis_runs

    UNION ALL

    -- Agent runs (with matching column names)
    SELECT id, check_id, run_number, compliance_status, confidence,
           ai_reasoning, violations, recommendations, raw_ai_response,
           completed_at as executed_at
    FROM public.agent_analysis_runs
    WHERE status = 'completed'
  ) combined
  ORDER BY check_id, executed_at DESC NULLS LAST
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
  code.id,
  code.title,
  code.year,
  code.source_url,
  COALESCE(c.manual_status, ar.compliance_status) AS effective_status,
  c.calculation_table,
  ar.source AS analysis_source
FROM assessments a
JOIN projects p ON p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN chapters ch ON ch.id = sec.chapter_id
LEFT JOIN codes code ON code.id = ch.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS FALSE
  AND (c.manual_status IS NULL OR c.manual_status NOT IN ('not_applicable', 'compliant'))
  AND (
    (c.manual_status IN ('non_compliant', 'insufficient_information'))
    OR (ar.compliance_status IN ('non_compliant', 'needs_more_info'))
  )

ORDER BY c.id

$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_assessment_report IS
'Fetches violation report data for an assessment. Returns checks that are non-compliant or need more info.
Includes results from both analysis_runs AND agent_analysis_runs (most recent wins).';


-- ============================================================================
-- 2. Update get_assessment_progress to include agent runs
-- ============================================================================

DROP FUNCTION IF EXISTS get_assessment_progress(uuid);

CREATE OR REPLACE FUNCTION get_assessment_progress(assessment_uuid UUID)
RETURNS TABLE (
  total_checks INTEGER,
  completed_checks INTEGER,
  progress_pct INTEGER
) AS $$
WITH latest_analysis AS (
  -- Get latest from BOTH tables
  SELECT DISTINCT ON (check_id) check_id, compliance_status
  FROM (
    SELECT check_id, run_number, compliance_status, executed_at
    FROM public.analysis_runs ar
    WHERE EXISTS (SELECT 1 FROM checks c WHERE c.id = ar.check_id AND c.assessment_id = assessment_uuid)

    UNION ALL

    SELECT check_id, run_number, compliance_status, completed_at as executed_at
    FROM public.agent_analysis_runs aar
    WHERE status = 'completed'
      AND EXISTS (SELECT 1 FROM checks c WHERE c.id = aar.check_id AND c.assessment_id = assessment_uuid)
  ) combined
  ORDER BY check_id, executed_at DESC NULLS LAST
),
applicable_checks AS (
  SELECT id, manual_status
  FROM checks c
  WHERE c.assessment_id = assessment_uuid
    AND c.is_excluded IS FALSE
),
checks_with_results AS (
  SELECT DISTINCT c.id
  FROM applicable_checks c
  LEFT JOIN latest_analysis ar ON ar.check_id = c.id
  WHERE c.manual_status IS NOT NULL
     OR ar.compliance_status IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM applicable_checks)::INTEGER AS total_checks,
  (SELECT COUNT(*) FROM checks_with_results)::INTEGER AS completed_checks,
  CASE
    WHEN (SELECT COUNT(*) FROM applicable_checks) > 0
    THEN ROUND((SELECT COUNT(*) FROM checks_with_results)::NUMERIC * 100 / (SELECT COUNT(*) FROM applicable_checks))::INTEGER
    ELSE 0
  END AS progress_pct;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_assessment_progress IS
'Returns progress statistics for an assessment. Includes both analysis_runs AND agent_analysis_runs.';


-- ============================================================================
-- 3. Update get_assessment_calculation_tables to include agent runs
-- ============================================================================

DROP FUNCTION IF EXISTS get_assessment_calculation_tables(uuid);

CREATE OR REPLACE FUNCTION get_assessment_calculation_tables(assessment_uuid UUID)
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
  calculation_table JSONB,
  analysis_source TEXT  -- NEW: 'ai' or 'agent' to indicate source
) AS $$
WITH latest_analysis AS (
  -- Get latest from BOTH tables, prefer most recent
  SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,
    compliance_status,
    confidence,
    ai_reasoning,
    violations,
    recommendations,
    raw_ai_response,
    executed_at,
    'ai' as source
  FROM (
    SELECT id, check_id, run_number, compliance_status, confidence,
           ai_reasoning, violations, recommendations, raw_ai_response,
           executed_at
    FROM public.analysis_runs

    UNION ALL

    SELECT id, check_id, run_number, compliance_status, confidence,
           ai_reasoning, violations, recommendations, raw_ai_response,
           completed_at as executed_at
    FROM public.agent_analysis_runs
    WHERE status = 'completed'
  ) combined
  ORDER BY check_id, executed_at DESC NULLS LAST
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
  code.id,
  code.title,
  code.year,
  code.source_url,
  COALESCE(c.manual_status, ar.compliance_status) AS effective_status,
  c.calculation_table,
  ar.source AS analysis_source
FROM assessments a
JOIN projects p ON p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN chapters ch ON ch.id = sec.chapter_id
LEFT JOIN codes code ON code.id = ch.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS FALSE
  AND c.calculation_table IS NOT NULL

ORDER BY c.id

$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_assessment_calculation_tables IS
'Fetches checks with calculation tables. Includes both analysis_runs AND agent_analysis_runs.';

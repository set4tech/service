-- Migration: Backfill analysis_runs for child section checks from parent element check section_results
-- This enables per-section AI judgments for element checks

-- Create analysis runs for child checks based on parent's section_results
INSERT INTO analysis_runs (
  check_id,
  run_number,
  compliance_status,
  confidence,
  ai_provider,
  ai_model,
  ai_reasoning,
  violations,
  recommendations,
  raw_ai_response,
  executed_at,
  section_results
)
SELECT
  c.id as check_id,
  ar.run_number,
  sr.value->>'compliance_status',
  sr.value->>'confidence',
  ar.ai_provider,
  ar.ai_model,
  sr.value->>'reasoning',
  COALESCE(sr.value->'violations', '[]'::jsonb),
  COALESCE(sr.value->'recommendations', '[]'::jsonb),
  sr.value::text,
  ar.executed_at,
  jsonb_build_array(sr.value) -- Store as single-element array
FROM analysis_runs ar
JOIN checks parent ON ar.check_id = parent.id
JOIN LATERAL jsonb_array_elements(ar.section_results) AS sr ON true
JOIN checks c ON c.parent_check_id = parent.id
  AND c.code_section_number = SPLIT_PART(sr.value->>'section_number', ' - ', 1)
WHERE parent.check_type = 'element'
  AND ar.section_results IS NOT NULL
  AND jsonb_array_length(ar.section_results) > 0
  AND NOT EXISTS (
    -- Don't create duplicates
    SELECT 1 FROM analysis_runs existing
    WHERE existing.check_id = c.id
      AND existing.run_number = ar.run_number
  );

-- Create view for latest child check status (useful for queries)
CREATE OR REPLACE VIEW latest_child_check_status AS
SELECT
  c.id as check_id,
  c.parent_check_id,
  c.code_section_key,
  c.code_section_number,
  COALESCE(c.manual_override, ar.compliance_status) as effective_status,
  ar.compliance_status as ai_status,
  c.manual_override,
  ar.confidence,
  ar.ai_reasoning,
  ar.violations,
  ar.recommendations,
  ar.executed_at as last_analyzed_at
FROM checks c
LEFT JOIN LATERAL (
  SELECT *
  FROM analysis_runs
  WHERE check_id = c.id
  ORDER BY run_number DESC
  LIMIT 1
) ar ON true
WHERE c.check_type = 'section'
  AND c.parent_check_id IS NOT NULL;

COMMENT ON VIEW latest_child_check_status IS
'Provides the latest analysis status for child section checks within element checks, with manual overrides taking precedence';

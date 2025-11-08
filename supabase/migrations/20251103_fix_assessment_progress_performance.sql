-- Fix critical performance bug: get_assessment_progress was scanning entire database
-- instead of filtering by assessment_uuid parameter
--
-- BEFORE: Scanned ALL analysis_runs and ALL checks across all assessments
-- AFTER: Only processes data for the specific assessment
--
-- Expected performance improvement: 3-5 seconds reduction

CREATE OR REPLACE FUNCTION get_assessment_progress(assessment_uuid UUID)
RETURNS TABLE (
  total_checks INTEGER,
  completed_checks INTEGER,
  progress_pct INTEGER
) AS $$
WITH latest_analysis AS (
    SELECT DISTINCT ON (check_id)
      id,
      check_id,
      run_number,
      compliance_status
    FROM public.analysis_runs ar
    WHERE EXISTS (
      SELECT 1 FROM checks c 
      WHERE c.id = ar.check_id 
      AND c.assessment_id = assessment_uuid
    )
    ORDER BY check_id, run_number DESC
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

-- Add indexes to support the new queries
CREATE INDEX IF NOT EXISTS idx_analysis_runs_check_id_run_number 
ON analysis_runs(check_id, run_number DESC);

CREATE INDEX IF NOT EXISTS idx_checks_assessment_id 
ON checks(assessment_id);

CREATE INDEX IF NOT EXISTS idx_checks_assessment_excluded_manual 
ON checks(assessment_id, is_excluded, manual_status)
WHERE is_excluded IS FALSE;

COMMENT ON FUNCTION get_assessment_progress IS 'Returns progress statistics for a specific assessment. Fixed in 20251103 to filter by assessment_uuid instead of scanning entire database.';




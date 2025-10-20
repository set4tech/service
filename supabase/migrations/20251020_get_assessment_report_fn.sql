CREATE OR REPLACE FUNCTION get_assessment_progress(assessment_uuid UUID)
RETURNS TABLE (
  total_checks INTEGER,
  completed_checks INTEGER,
  progress_pct INTEGER
) AS $$
with latest_analysis as (
    SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,
    compliance_status
  FROM public.analysis_runs
  ORDER BY check_id, run_number DESC
),

  applicable_checks AS (
    SELECT id, manual_status
    FROM checks c
    WHERE 
       manual_status IS NULL
      AND c.is_excluded is false
  ),
  checks_with_results AS (
    SELECT DISTINCT c.id
    FROM applicable_checks c
    LEFT JOIN latest_analysis ar ON ar.check_id = c.id
    WHERE  manual_status is NOT NULL
OR compliance_status is not null
  )
  SELECT
    (SELECT COUNT(*) FROM applicable_checks)::INTEGER as total_checks,
    (SELECT COUNT(*) FROM checks_with_results)::INTEGER as completed_checks,
    CASE
      WHEN (SELECT COUNT(*) FROM applicable_checks) > 0
      THEN ROUND((SELECT COUNT(*) FROM checks_with_results)::NUMERIC * 100 / (SELECT COUNT(*) FROM applicable_checks))::INTEGER
      ELSE 0
    END as progress_pct;
$$ LANGUAGE sql STABLE;
-- Add PostgREST foreign key hint for latest_analysis_runs view
-- This allows Supabase to perform nested queries like checks->latest_analysis_runs
COMMENT ON VIEW latest_analysis_runs IS
  '@foreignkey (check_id) references checks(id)';

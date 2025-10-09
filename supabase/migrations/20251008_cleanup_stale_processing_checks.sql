-- Migration: Cleanup stale processing checks
-- Resets checks that have been stuck in 'processing' or 'analyzing' status for more than 5 minutes

-- Create function to cleanup stale processing checks
CREATE OR REPLACE FUNCTION cleanup_stale_processing_checks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE checks
  SET status = 'pending'
  WHERE status IN ('processing', 'analyzing')
    AND updated_at < NOW() - INTERVAL '5 minutes';

  -- Log the cleanup
  RAISE NOTICE 'Cleaned up % stale processing checks',
    (SELECT COUNT(*) FROM checks
     WHERE status IN ('processing', 'analyzing')
     AND updated_at < NOW() - INTERVAL '5 minutes');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_stale_processing_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_stale_processing_checks() TO service_role;

-- Run cleanup immediately
SELECT cleanup_stale_processing_checks();

-- Note: To schedule this function to run periodically, you can:
-- 1. Use Supabase Edge Functions with a cron trigger
-- 2. Use pg_cron extension (if available)
-- 3. Call this function from your application startup or health check endpoint
--
-- Example Edge Function cron (in supabase/functions/cleanup-stale-checks/index.ts):
-- Deno.serve(async (req) => {
--   const { data, error } = await supabaseAdmin.rpc('cleanup_stale_processing_checks');
--   return new Response(JSON.stringify({ data, error }));
-- });

-- Add batch support to analysis_runs table

ALTER TABLE analysis_runs
ADD COLUMN IF NOT EXISTS batch_group_id UUID,
ADD COLUMN IF NOT EXISTS batch_number INTEGER,
ADD COLUMN IF NOT EXISTS total_batches INTEGER,
ADD COLUMN IF NOT EXISTS section_keys_in_batch TEXT[];

-- Add index for querying by batch_group_id
CREATE INDEX IF NOT EXISTS idx_analysis_runs_batch_group_id
ON analysis_runs(batch_group_id);

-- Add comments
COMMENT ON COLUMN analysis_runs.batch_group_id IS 'Links multiple batched assessment runs together';
COMMENT ON COLUMN analysis_runs.batch_number IS 'Which batch this is (1-indexed)';
COMMENT ON COLUMN analysis_runs.total_batches IS 'Total number of batches in this group';
COMMENT ON COLUMN analysis_runs.section_keys_in_batch IS 'Array of code section keys assessed in this batch';

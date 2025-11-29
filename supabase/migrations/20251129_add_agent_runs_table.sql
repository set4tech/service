-- Agent Runs table for tracking long-running agent analysis jobs
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress JSONB DEFAULT '{}',  -- Flexible progress tracking (e.g., {step: 1, total_steps: 5, message: "Analyzing..."})
  results JSONB,                -- Analysis results
  error TEXT,                   -- Error message if failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for efficient lookup by assessment
CREATE INDEX idx_agent_runs_assessment_id ON agent_runs(assessment_id);

-- Index for finding latest run
CREATE INDEX idx_agent_runs_created_at ON agent_runs(assessment_id, created_at DESC);

-- RLS policies (disabled for now since we use service role)
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can do everything on agent_runs" ON agent_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE agent_runs IS 'Tracks long-running agent analysis jobs triggered from the UI';
COMMENT ON COLUMN agent_runs.progress IS 'Flexible JSON for progress tracking, e.g., {step: 1, total_steps: 5, message: "..."}';
COMMENT ON COLUMN agent_runs.results IS 'Final analysis results in JSON format';

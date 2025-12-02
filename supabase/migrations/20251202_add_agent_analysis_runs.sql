-- Agent Analysis Runs table for per-check agentic compliance assessment
-- This table stores results from the agent compliance feature that uses
-- Claude with tool_use to reason about building code compliance

CREATE TABLE agent_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,

  -- Match analysis_runs fields for report compatibility
  run_number INT NOT NULL DEFAULT 1,
  compliance_status TEXT,  -- compliant|non_compliant|unclear|not_applicable|needs_more_info
  confidence TEXT,         -- high|medium|low
  ai_reasoning TEXT,       -- Final assessment text
  violations JSONB,        -- [{description, severity, location_in_evidence}]
  compliant_aspects JSONB, -- [string]
  recommendations JSONB,   -- [string]
  additional_evidence_needed JSONB,  -- [string]

  -- Agent-specific fields
  reasoning_trace JSONB,   -- Full agent conversation:
                           -- [{iteration, type, content, tool?, input?, result?}]
  tools_used TEXT[],       -- ['find_schedules', 'calculate', ...]
  iteration_count INT,     -- How many LLM iterations

  -- Metadata
  ai_provider TEXT DEFAULT 'anthropic',
  ai_model TEXT,           -- claude-sonnet-4-20250514
  execution_time_ms INT,
  raw_ai_response TEXT,    -- Full final response text

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_agent_analysis_runs_check_id ON agent_analysis_runs(check_id);
CREATE INDEX idx_agent_analysis_runs_status ON agent_analysis_runs(status);
CREATE INDEX idx_agent_analysis_runs_check_run ON agent_analysis_runs(check_id, run_number DESC);

-- Unique constraint on check_id + run_number
ALTER TABLE agent_analysis_runs ADD CONSTRAINT agent_analysis_runs_check_id_run_number_key
  UNIQUE (check_id, run_number);

-- RLS policies (disabled for now since we use service role)
ALTER TABLE agent_analysis_runs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can do everything on agent_analysis_runs" ON agent_analysis_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE agent_analysis_runs IS
'Stores per-check agent compliance assessment results. Uses Claude with tool_use for
multi-step reasoning. Results integrate with analysis_runs for unified reporting.';

COMMENT ON COLUMN agent_analysis_runs.reasoning_trace IS
'Full agent conversation trace: [{iteration, type, content, tool?, input?, result?}]';

COMMENT ON COLUMN agent_analysis_runs.tools_used IS
'List of tools invoked during assessment (e.g., find_schedules, calculate)';

-- Update compliance_status to support the new enum values
-- Current values: stored as VARCHAR, need to update to support: compliant, violation, needs_more_info

-- The analysis_runs table already uses VARCHAR(50) for compliance_status, so no schema change needed
-- Just documenting the valid values:
-- Valid compliance_status values: 'compliant', 'violation', 'needs_more_info', 'non_compliant', 'partially_compliant', 'unclear', 'not_applicable'

-- Update AI provider field to support new model names
-- Valid ai_provider values: 'gemini', 'openai', 'anthropic'
-- Valid ai_model values: 'gemini-2.5-pro', 'gemini-2.0-flash-exp', 'claude-opus-4', 'gpt-4o', 'gpt-4-vision-preview'

-- No actual schema changes needed since we're using VARCHAR fields
-- This migration is just for documentation and future reference

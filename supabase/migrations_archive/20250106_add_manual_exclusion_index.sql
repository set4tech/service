-- Add index for manual exclusions in section_applicability_log
-- This speeds up filtering checks by manually excluded sections

CREATE INDEX IF NOT EXISTS idx_section_applicability_log_manual
ON section_applicability_log(assessment_id, section_key, decision)
WHERE decision_source = 'manual';

-- Add comment
COMMENT ON INDEX idx_section_applicability_log_manual IS 'Speeds up filtering checks by manually excluded sections (decision_source=manual)';

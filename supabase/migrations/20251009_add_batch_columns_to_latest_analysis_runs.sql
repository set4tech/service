-- Update latest_analysis_runs view to include batch columns
-- This allows the customer report to aggregate violations from all batches in an element check

DROP VIEW IF EXISTS check_summary CASCADE;
DROP VIEW IF EXISTS latest_analysis_runs CASCADE;

-- Recreate latest_analysis_runs with batch columns
CREATE VIEW latest_analysis_runs AS
SELECT DISTINCT ON (ar.check_id)
  ar.id,
  ar.check_id,
  ar.run_number,
  ar.compliance_status,
  ar.confidence,
  ar.ai_provider,
  ar.ai_model,
  ar.ai_reasoning,
  ar.violations,
  ar.compliant_aspects,
  ar.recommendations,
  ar.additional_evidence_needed,
  ar.raw_ai_response,
  ar.human_override,
  ar.human_notes,
  ar.executed_at,
  ar.execution_time_ms,
  ar.batch_group_id,
  ar.batch_number,
  ar.total_batches,
  ar.section_keys_in_batch,
  c.code_section_key,
  c.code_section_number,
  c.check_name
FROM analysis_runs ar
JOIN checks c ON ar.check_id = c.id
ORDER BY ar.check_id, ar.run_number DESC;

-- Recreate check_summary view
CREATE VIEW check_summary AS
SELECT
  c.*,
  lar.compliance_status as latest_status,
  lar.confidence as latest_confidence,
  lar.executed_at as last_analyzed_at,
  COUNT(DISTINCT ar.id) as total_runs,
  COUNT(DISTINCT sca.screenshot_id) as screenshot_count
FROM checks c
LEFT JOIN latest_analysis_runs lar ON c.id = lar.check_id
LEFT JOIN analysis_runs ar ON c.id = ar.check_id
LEFT JOIN screenshot_check_assignments sca ON c.id = sca.check_id
GROUP BY c.id, lar.compliance_status, lar.confidence, lar.executed_at;

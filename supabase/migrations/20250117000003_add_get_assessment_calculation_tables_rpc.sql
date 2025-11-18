-- Create RPC to get all checks with calculation tables for an assessment
-- This returns ALL checks with calculation tables, not just violations
-- Used in the Customer Report Viewer sidebar "Tables" view

CREATE OR REPLACE FUNCTION get_assessment_calculation_tables(assessment_uuid UUID)
RETURNS TABLE (
  check_id UUID,
  code_section_number TEXT,
  code_section_title TEXT,
  check_name TEXT,
  human_readable_title TEXT,
  calculation_table JSONB,
  manual_status TEXT
) AS $$
SELECT 
  c.id as check_id,
  c.code_section_number,
  c.code_section_title,
  c.check_name,
  c.human_readable_title,
  c.calculation_table,
  c.manual_status
FROM checks c
WHERE c.assessment_id = assessment_uuid
  AND c.calculation_table IS NOT NULL
  AND c.is_excluded = false
ORDER BY c.code_section_number;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_assessment_calculation_tables(UUID) IS 
'Returns all checks with calculation tables for a given assessment. 
Used in the Customer Report Viewer to display all calculation tables (not just violations).';



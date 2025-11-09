-- Update all PostgreSQL functions to use section_id instead of code_section_key/section_key
-- This migration updates RPC functions to work with the new UUID-based foreign keys

-- Update get_element_sections to return section_id instead of section_key
CREATE OR REPLACE FUNCTION get_element_sections(
  p_element_group_id uuid,
  p_assessment_id uuid
) RETURNS TABLE (section_id uuid) AS $$
BEGIN
  -- First check if there are any assessment-specific mappings
  IF EXISTS (
    SELECT 1 FROM element_section_mappings
    WHERE element_group_id = p_element_group_id
    AND assessment_id = p_assessment_id
  ) THEN
    -- Use assessment-specific mappings
    RETURN QUERY
    SELECT esm.section_id
    FROM element_section_mappings esm
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id = p_assessment_id;
  ELSE
    -- Fall back to global mappings
    RETURN QUERY
    SELECT esm.section_id
    FROM element_section_mappings esm
    WHERE esm.element_group_id = p_element_group_id
    AND esm.assessment_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update copy_element_mappings_to_assessment to copy section_id instead of section_key
CREATE OR REPLACE FUNCTION copy_element_mappings_to_assessment(
  p_assessment_id uuid,
  p_element_group_id uuid DEFAULT NULL -- If NULL, copies all element groups
) RETURNS void AS $$
BEGIN
  INSERT INTO element_section_mappings (element_group_id, section_id, assessment_id)
  SELECT
    element_group_id,
    section_id,
    p_assessment_id
  FROM element_section_mappings
  WHERE assessment_id IS NULL
    AND (p_element_group_id IS NULL OR element_group_id = p_element_group_id)
  ON CONFLICT DO NOTHING; -- Skip if already exists
END;
$$ LANGUAGE plpgsql;

-- Update get_section_with_references to use section_id
CREATE OR REPLACE FUNCTION get_section_with_references(section_key TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'section', row_to_json(s.*),
    'references', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'key', ref_section.key,
            'number', ref_section.number,
            'title', ref_section.title,
            'text', ref_section.text,
            'paragraphs', ref_section.paragraphs,
            'citation_text', sr.citation_text,
            'explicit', sr.explicit
          )
        )
        FROM section_references sr
        INNER JOIN sections ref_section ON sr.target_section_id = ref_section.id
        WHERE sr.source_section_id = s.id
      ),
      '[]'::json
    )
  ) INTO result
  FROM sections s
  WHERE s.key = section_key
    AND s.never_relevant = false;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update get_assessment_report to use section_id
DROP FUNCTION IF EXISTS get_assessment_report(uuid);

CREATE OR REPLACE FUNCTION get_assessment_report(assessment_uuid UUID)
RETURNS TABLE (
  project_name TEXT,
  pdf_url TEXT,
  building_params JSONB,
  project_id UUID,
  assessment_id UUID,
  check_id UUID,
  check_name TEXT,
  code_section_key TEXT,
  code_section_number TEXT,
  code_section_title TEXT,
  manual_status TEXT,
  manual_status_note TEXT,
  is_excluded BOOLEAN,
  human_readable_title TEXT,
  check_type TEXT,
  instance_label TEXT,
  element_group_name TEXT,
  compliance_status TEXT,
  ai_reasoning TEXT,
  confidence TEXT,
  raw_ai_response TEXT,
  violations JSONB,
  recommendations JSONB,
  screenshots JSONB,
  source_url TEXT,
  section_number TEXT,
  parent_source_url TEXT,
  code_id TEXT,
  code_title TEXT,
  code_version TEXT,
  code_source_url TEXT,
  effective_status TEXT
) AS $$
with latest_analysis as (
    SELECT DISTINCT ON (check_id)
    id,
    check_id,
    run_number,
    compliance_status,
    confidence,
    ai_provider,
    ai_model,
    ai_reasoning,
    violations,
    compliant_aspects,
    recommendations,
    additional_evidence_needed,
    raw_ai_response,
    executed_at,
    execution_time_ms,
    section_results,
    batch_group_id,
    batch_number,
    total_batches,
    section_keys_in_batch
  FROM public.analysis_runs
  ORDER BY check_id, run_number DESC
),
check_screenshots as (
  SELECT
    c.id as check_id,
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'screenshot_url', s.screenshot_url,
        'thumbnail_url', s.thumbnail_url,
        'page_number', s.page_number,
        'crop_coordinates', s.crop_coordinates
      )
    ) FILTER (WHERE s.id IS NOT NULL) as screenshots
  FROM checks c
  LEFT JOIN checks sibling ON (
    (c.element_group_id IS NOT NULL
     AND c.instance_label IS NOT NULL
     AND sibling.assessment_id = c.assessment_id
     AND sibling.element_group_id = c.element_group_id
     AND sibling.instance_label = c.instance_label)
    OR
    (sibling.id = c.id)
  )
  LEFT JOIN screenshot_check_assignments sca ON sca.check_id = sibling.id
  LEFT JOIN screenshots s ON s.id = sca.screenshot_id
  GROUP BY c.id
)
SELECT
  p.name,
  p.pdf_url,
  p.extracted_variables,
  p.id,
  a.id,
  c.id,
  c.check_name,
  c.code_section_key,
  c.code_section_number,
  c.code_section_title,
  c.manual_status,
  c.manual_status_note,
  c.is_excluded,
  c.human_readable_title,
  c.check_type,
  c.instance_label,
  eg.name,
  ar.compliance_status,
  ar.ai_reasoning,
  ar.confidence,
  ar.raw_ai_response,
  ar.violations,
  ar.recommendations,
  cs.screenshots,
  sec.source_url,
  sec.number,
  parent_sec.source_url,
  code.id,
  code.title,
  code.version,
  code.source_url,
  coalesce(c.manual_status, ar.compliance_status) as effective_status
FROM assessments a
JOIN projects p on p.id = a.project_id
JOIN checks c ON c.assessment_id = a.id
LEFT JOIN element_groups eg ON c.element_group_id = eg.id
LEFT JOIN latest_analysis ar ON ar.check_id = c.id
LEFT JOIN check_screenshots cs ON cs.check_id = c.id
LEFT JOIN sections sec ON sec.id = c.section_id
LEFT JOIN sections parent_sec ON parent_sec.key = sec.parent_key
LEFT JOIN codes code ON code.id = sec.code_id

WHERE a.id = assessment_uuid
  AND c.is_excluded IS false
  AND (c.manual_status IS NULL OR c.manual_status NOT IN ('not_applicable', 'compliant'))
  AND ((c.manual_status IN ('non_compliant', 'insufficient_information')
       OR ar.compliance_status IN ('non_compliant', 'needs_more_info')))

ORDER BY ar.check_id

$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_element_sections IS 'Gets section UUIDs for element group, checking assessment-specific first, then global defaults';
COMMENT ON FUNCTION get_section_with_references IS 'Fetches a section and all its referenced sections in a single query using UUID joins';


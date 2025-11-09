-- Create RPC function to fetch section with references in one query
-- This replaces 3 separate queries (section + references + referenced sections) with a single database call
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
        INNER JOIN sections ref_section ON sr.target_section_key = ref_section.key
        WHERE sr.source_section_key = s.key
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

-- Add comment
COMMENT ON FUNCTION get_section_with_references(TEXT) IS 
  'Fetches a section and all its referenced sections in a single query. Returns JSON with section object and references array.';


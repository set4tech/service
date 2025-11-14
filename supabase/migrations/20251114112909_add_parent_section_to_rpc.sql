-- Migration: Add parent section to get_section_with_references RPC function
-- This allows fetching a section along with its parent section and references in a single call

CREATE OR REPLACE FUNCTION get_section_with_references(section_key TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
  section_id_val UUID;
  parent_key_val TEXT;
BEGIN
  -- Get the section id and parent_key
  SELECT id, parent_key INTO section_id_val, parent_key_val
  FROM sections
  WHERE key = section_key AND never_relevant = false;

  -- If section not found, return null
  IF section_id_val IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build the result with section, parent_section, and references
  SELECT json_build_object(
    'section', row_to_json(s.*),
    'parent_section', (
      SELECT CASE 
        WHEN s.parent_key IS NOT NULL THEN
          json_build_object(
            'key', parent_sec.key,
            'number', parent_sec.number,
            'title', parent_sec.title,
            'text', parent_sec.text,
            'paragraphs', parent_sec.paragraphs
          )
        ELSE NULL
      END
      FROM sections parent_sec
      WHERE parent_sec.key = s.parent_key
    ),
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
        WHERE sr.source_section_key = section_key
      ),
      '[]'::json
    )
  ) INTO result
  FROM sections s
  WHERE s.id = section_id_val;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_section_with_references(TEXT) IS 
  'Fetches a section with its parent section and all referenced sections in a single query. 
   Returns JSON with section, parent_section (if exists), and references array.';


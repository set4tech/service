-- Update the search functions to normalize content for apostrophe-insensitive matching
-- This allows "womens" to match "women's" and vice versa

CREATE OR REPLACE FUNCTION search_pdf_fulltext(
  p_project_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  page_number INTEGER,
  chunk_number INTEGER,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pdf_chunks.page_number,
    pdf_chunks.chunk_number,
    ts_rank(
      to_tsvector('english', regexp_replace(pdf_chunks.content, '''', '', 'g')),
      websearch_to_tsquery('english', p_query)
    )::REAL AS rank
  FROM pdf_chunks
  WHERE pdf_chunks.project_id = p_project_id
    AND to_tsvector('english', regexp_replace(pdf_chunks.content, '''', '', 'g')) 
        @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION search_pdf_fuzzy(
  p_project_id UUID,
  p_query TEXT,
  p_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  page_number INTEGER,
  chunk_number INTEGER,
  similarity REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pdf_chunks.page_number,
    pdf_chunks.chunk_number,
    similarity(regexp_replace(pdf_chunks.content, '''', '', 'g'), p_query) AS similarity
  FROM pdf_chunks
  WHERE pdf_chunks.project_id = p_project_id
    AND regexp_replace(pdf_chunks.content, '''', '', 'g') % p_query
    AND similarity(regexp_replace(pdf_chunks.content, '''', '', 'g'), p_query) > p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;


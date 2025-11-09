-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create pdf_chunks table for storing searchable PDF text
CREATE TABLE pdf_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  chunk_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_project_page_chunk UNIQUE (project_id, page_number, chunk_number)
);

-- Full-text search index using GIN
CREATE INDEX pdf_chunks_tsv_gin ON pdf_chunks USING GIN (tsv);

-- Trigram fuzzy search index for OCR error tolerance
CREATE INDEX pdf_chunks_trgm_gin ON pdf_chunks USING GIN (content gin_trgm_ops);

-- Index for project lookups
CREATE INDEX pdf_chunks_project_id ON pdf_chunks (project_id);

-- Add chunking_status to projects table for tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chunking_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chunking_started_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chunking_completed_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chunking_error TEXT;

-- Index for filtering by chunking status
CREATE INDEX IF NOT EXISTS idx_projects_chunking_status ON projects (chunking_status);

-- RPC function for full-text search
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
    ts_rank(pdf_chunks.tsv, websearch_to_tsquery('english', p_query))::REAL AS rank
  FROM pdf_chunks
  WHERE pdf_chunks.project_id = p_project_id
    AND pdf_chunks.tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC function for fuzzy (trigram) search
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
    similarity(pdf_chunks.content, p_query) AS similarity
  FROM pdf_chunks
  WHERE pdf_chunks.project_id = p_project_id
    AND pdf_chunks.content % p_query
    AND similarity(pdf_chunks.content, p_query) > p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;


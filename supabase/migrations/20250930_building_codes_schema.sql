-- Building Codes Schema Migration
-- Stores building code documents, sections, and their relationships

-- ============================================================================
-- Table: codes
-- Stores master building code documents (e.g., ICC A117.1, California CBC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS codes (
    id TEXT PRIMARY KEY,  -- Format: "ICC+A117.1+2017+CA" or "ICC+A117.1+2017"
    provider TEXT NOT NULL,  -- e.g., "ICC", "NYSBC", "CA"
    source_id TEXT NOT NULL,  -- e.g., "A117.1", "Chapter11", "CBC_Chapter11B"
    version TEXT NOT NULL,  -- e.g., "2017", "2025"
    jurisdiction TEXT,  -- e.g., "CA", "NY", NULL for national codes
    title TEXT NOT NULL,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique combination of provider+source_id+version+jurisdiction
    CONSTRAINT unique_code_version UNIQUE (provider, source_id, version, jurisdiction)
);

-- Indexes for codes table
CREATE INDEX IF NOT EXISTS idx_codes_provider ON codes(provider);
CREATE INDEX IF NOT EXISTS idx_codes_source_id ON codes(source_id);
CREATE INDEX IF NOT EXISTS idx_codes_version ON codes(version);
CREATE INDEX IF NOT EXISTS idx_codes_jurisdiction ON codes(jurisdiction);

-- Comments
COMMENT ON TABLE codes IS 'Master building code documents';
COMMENT ON COLUMN codes.id IS 'Composite key: provider+source_id+version[+jurisdiction]';
COMMENT ON COLUMN codes.provider IS 'Code publisher: ICC, NYSBC, CA, etc.';
COMMENT ON COLUMN codes.source_id IS 'Code identifier within provider';
COMMENT ON COLUMN codes.jurisdiction IS 'State/locality code (NULL for national)';


-- ============================================================================
-- Table: sections
-- Stores all sections and subsections (hierarchical tree structure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sections (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,  -- Format: "ICC:A117.1:2017:CA:401.1" or "ICC:A117.1:2017:401.1"
    code_id TEXT NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
    parent_key TEXT REFERENCES sections(key) ON DELETE CASCADE,

    -- Section identification
    number TEXT NOT NULL,  -- e.g., "401", "401.1", "401.1.1"
    title TEXT NOT NULL,
    text TEXT,  -- Full text content of the section
    item_type TEXT NOT NULL CHECK (item_type IN ('section', 'subsection')),
    code_type TEXT NOT NULL CHECK (code_type IN ('accessibility', 'building', 'fire', 'plumbing', 'mechanical', 'energy')),

    -- Content
    paragraphs JSONB DEFAULT '[]'::jsonb,  -- Array of paragraph text strings

    -- Metadata
    source_url TEXT,
    source_page INTEGER,
    hash TEXT NOT NULL,  -- SHA256 hash for change detection

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique combination of number within each code
    -- This constraint ensures section "401.1" is unique within "ICC+A117.1+2017"
    CONSTRAINT unique_section_number_per_code UNIQUE (code_id, number)
);

-- Indexes for sections table
CREATE INDEX IF NOT EXISTS idx_sections_code_id ON sections(code_id);
CREATE INDEX IF NOT EXISTS idx_sections_key ON sections(key);
CREATE INDEX IF NOT EXISTS idx_sections_number ON sections(number);
CREATE INDEX IF NOT EXISTS idx_sections_parent_key ON sections(parent_key);
CREATE INDEX IF NOT EXISTS idx_sections_item_type ON sections(item_type);
CREATE INDEX IF NOT EXISTS idx_sections_code_type ON sections(code_type);
CREATE INDEX IF NOT EXISTS idx_sections_hash ON sections(hash);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_sections_text_search ON sections USING GIN (to_tsvector('english', COALESCE(text, '')));
CREATE INDEX IF NOT EXISTS idx_sections_title_search ON sections USING GIN (to_tsvector('english', title));

-- JSONB index for paragraphs array
CREATE INDEX IF NOT EXISTS idx_sections_paragraphs ON sections USING GIN (paragraphs);

-- Comments
COMMENT ON TABLE sections IS 'Building code sections and subsections (hierarchical tree)';
COMMENT ON COLUMN sections.key IS 'Unique identifier: provider:source_id:version[:jurisdiction]:number';
COMMENT ON COLUMN sections.code_id IS 'Parent code document reference';
COMMENT ON COLUMN sections.parent_key IS 'Parent section key (NULL for top-level sections)';
COMMENT ON COLUMN sections.number IS 'Section number: 401, 401.1, 401.1.1, etc.';
COMMENT ON COLUMN sections.item_type IS 'Type: section (top-level) or subsection';
COMMENT ON COLUMN sections.code_type IS 'Category: accessibility, building, fire, etc.';
COMMENT ON COLUMN sections.paragraphs IS 'Array of paragraph text strings';
COMMENT ON COLUMN sections.hash IS 'SHA256 hash of content for change detection';


-- ============================================================================
-- Table: section_references
-- Stores cross-references between sections (e.g., "See Section 401.1")
-- ============================================================================
CREATE TABLE IF NOT EXISTS section_references (
    id SERIAL PRIMARY KEY,
    source_section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
    target_section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,

    -- Reference metadata
    explicit BOOLEAN DEFAULT TRUE,  -- Explicitly stated reference vs. inferred
    citation_text TEXT,  -- Original citation text (e.g., "See Section 401.1")

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure no duplicate references
    CONSTRAINT unique_section_reference UNIQUE (source_section_key, target_section_key),

    -- Prevent self-references
    CONSTRAINT no_self_reference CHECK (source_section_key != target_section_key)
);

-- Indexes for section_references table
CREATE INDEX IF NOT EXISTS idx_section_refs_source ON section_references(source_section_key);
CREATE INDEX IF NOT EXISTS idx_section_refs_target ON section_references(target_section_key);
CREATE INDEX IF NOT EXISTS idx_section_refs_explicit ON section_references(explicit);

-- Comments
COMMENT ON TABLE section_references IS 'Cross-references between code sections';
COMMENT ON COLUMN section_references.explicit IS 'TRUE for explicit citations, FALSE for inferred';
COMMENT ON COLUMN section_references.citation_text IS 'Original citation text from the code';


-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_codes_updated_at BEFORE UPDATE ON codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Helper Views
-- ============================================================================

-- View: Top-level sections for each code
CREATE OR REPLACE VIEW code_top_sections AS
SELECT
    c.id AS code_id,
    c.provider,
    c.source_id,
    c.version,
    c.jurisdiction,
    c.title AS code_title,
    s.key AS section_key,
    s.number AS section_number,
    s.title AS section_title,
    s.code_type
FROM codes c
JOIN sections s ON s.code_id = c.id
WHERE s.parent_key IS NULL
ORDER BY c.id, s.number;

COMMENT ON VIEW code_top_sections IS 'Top-level sections for each code document';


-- View: Section hierarchy (with parent info)
CREATE OR REPLACE VIEW section_hierarchy AS
SELECT
    s.key,
    s.code_id,
    s.number,
    s.title,
    s.item_type,
    s.parent_key,
    p.number AS parent_number,
    p.title AS parent_title
FROM sections s
LEFT JOIN sections p ON s.parent_key = p.key
ORDER BY s.code_id, s.number;

COMMENT ON VIEW section_hierarchy IS 'Section hierarchy with parent information';


-- ============================================================================
-- RLS Policies (optional - enable if using Supabase auth)
-- ============================================================================

-- Enable RLS on all tables (commented out by default)
-- ALTER TABLE codes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE section_references ENABLE ROW LEVEL SECURITY;

-- Example policy: Allow public read access
-- CREATE POLICY "Public read access" ON codes FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON sections FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON section_references FOR SELECT USING (true);
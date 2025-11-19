-- Migration: Add comments table for coordination/QC/constructability comments
-- These are NOT code violations, but sheet coordination issues

-- Create comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,

  -- Page/location info (similar to screenshots)
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  crop_coordinates JSONB, -- Optional bounding box {x, y, width, height, zoom_level}

  -- Comment content
  comment_type TEXT NOT NULL DEFAULT 'coordination'
    CHECK (comment_type IN ('coordination', 'qc', 'constructability', 'general')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'minor', 'moderate', 'major')),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'acknowledged')),
  resolved_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, -- Optional FK to auth.users if needed
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Optional: Link to specific sheet or discipline
  sheet_name TEXT, -- e.g., "E-0.1", "E-0.2"
  discipline TEXT, -- e.g., "electrical", "mechanical", "structural"

  -- Optional: Tags for filtering
  tags TEXT[] DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_comments_assessment_id ON comments(assessment_id);
CREATE INDEX idx_comments_status ON comments(status);
CREATE INDEX idx_comments_severity ON comments(severity);
CREATE INDEX idx_comments_type ON comments(comment_type);
CREATE INDEX idx_comments_page_number ON comments(page_number);
CREATE INDEX idx_comments_sheet ON comments(sheet_name) WHERE sheet_name IS NOT NULL;
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create screenshot-comment assignments table (many-to-many)
CREATE TABLE screenshot_comment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screenshot_id UUID NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT screenshot_comment_unique UNIQUE (screenshot_id, comment_id)
);

-- Create indexes for screenshot assignments
CREATE INDEX idx_screenshot_comment_assignments_screenshot
  ON screenshot_comment_assignments(screenshot_id);
CREATE INDEX idx_screenshot_comment_assignments_comment
  ON screenshot_comment_assignments(comment_id);

-- Add comment to track migration
COMMENT ON TABLE comments IS 'Coordination, QC, and constructability comments that are NOT tied to specific code sections';
COMMENT ON TABLE screenshot_comment_assignments IS 'Many-to-many relationship between screenshots and comments';

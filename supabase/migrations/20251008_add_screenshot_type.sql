-- Add screenshot_type column (default 'plan' for backwards compatibility)
ALTER TABLE screenshots
ADD COLUMN screenshot_type TEXT NOT NULL DEFAULT 'plan'
CHECK (screenshot_type IN ('plan', 'elevation'));

-- Add element_group_id for dynamic element categorization
ALTER TABLE screenshots
ADD COLUMN element_group_id UUID REFERENCES element_groups(id) ON DELETE SET NULL;

-- Add extracted_text for searchability (from PDF source)
ALTER TABLE screenshots
ADD COLUMN extracted_text TEXT;

-- Create GIN index for full-text search on caption and extracted_text
CREATE INDEX idx_screenshots_text_search ON screenshots
USING GIN (to_tsvector('english', COALESCE(caption, '') || ' ' || COALESCE(extracted_text, '')));

-- Create index on screenshot_type for filtering
CREATE INDEX idx_screenshots_type ON screenshots(screenshot_type);

-- Create index on element_group_id for filtering
CREATE INDEX idx_screenshots_element_group ON screenshots(element_group_id) WHERE element_group_id IS NOT NULL;

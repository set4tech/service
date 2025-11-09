-- Create junction table for many-to-many screenshot-check relationships
CREATE TABLE screenshot_check_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenshot_id uuid NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  is_original boolean DEFAULT false,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid,
  UNIQUE(screenshot_id, check_id)
);

-- Indexes for performance
CREATE INDEX idx_screenshot_assignments_check ON screenshot_check_assignments(check_id);
CREATE INDEX idx_screenshot_assignments_screenshot ON screenshot_check_assignments(screenshot_id);
CREATE INDEX idx_screenshot_assignments_original ON screenshot_check_assignments(is_original) WHERE is_original = true;

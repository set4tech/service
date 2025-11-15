-- Create junction table for screenshots and element instances
-- This allows screenshots to be assigned to element instances (e.g., "Doors 1", "Ramp 2")
-- All checks for that element instance will share these screenshots
CREATE TABLE IF NOT EXISTS screenshot_element_instance_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenshot_id uuid NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  element_instance_id uuid NOT NULL REFERENCES element_instances(id) ON DELETE CASCADE,
  is_original boolean DEFAULT false,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid,

  -- Ensure a screenshot can only be assigned once to the same element instance
  CONSTRAINT screenshot_element_instance_assignments_screenshot_id_element_instance_id_key
    UNIQUE(screenshot_id, element_instance_id)
);

-- Add indexes for performance
CREATE INDEX idx_screenshot_element_instance_screenshot
  ON screenshot_element_instance_assignments(screenshot_id);

CREATE INDEX idx_screenshot_element_instance_element
  ON screenshot_element_instance_assignments(element_instance_id);

CREATE INDEX idx_screenshot_element_instance_original
  ON screenshot_element_instance_assignments(is_original)
  WHERE is_original = true;

-- Add comment explaining the table
COMMENT ON TABLE screenshot_element_instance_assignments IS
  'Junction table mapping screenshots to element instances (e.g., Door 1, Ramp 2). Allows multiple screenshots per element instance and screenshot reuse across instances. All checks for an element instance share the same screenshots.';

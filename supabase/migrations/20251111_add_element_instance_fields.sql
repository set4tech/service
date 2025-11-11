-- Add fields for CSV import: parameters, bounding box, and page number
ALTER TABLE element_instances
ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bounding_box JSONB,
ADD COLUMN IF NOT EXISTS page_number INTEGER;

-- Create GIN index for efficient querying of JSONB parameters
CREATE INDEX IF NOT EXISTS idx_element_instances_parameters
ON element_instances USING GIN (parameters);

-- Create index for page_number for filtering
CREATE INDEX IF NOT EXISTS idx_element_instances_page_number
ON element_instances(page_number);

-- Comments
COMMENT ON COLUMN element_instances.parameters IS
'JSONB field storing element-specific parameters (e.g., door measurements: clear_width_inches, pull_side_perpendicular_clearance_inches). Structure varies by element_group_id and maps to DoorParameters type for doors.';

COMMENT ON COLUMN element_instances.bounding_box IS
'JSONB field storing PDF bounding box coordinates in points: {x: number, y: number, width: number, height: number}. Used for highlighting element location on PDF.';

COMMENT ON COLUMN element_instances.page_number IS
'PDF page number (1-indexed) where this element instance is located.';

-- Add parameters column to element_instances for storing element-specific data
-- (e.g., door measurements, ramp slopes, bathroom dimensions)
ALTER TABLE element_instances 
ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}';

-- Create GIN index for efficient querying of JSONB parameters
CREATE INDEX IF NOT EXISTS idx_element_instances_parameters 
ON element_instances USING GIN (parameters);

COMMENT ON COLUMN element_instances.parameters IS
'JSONB field storing element-specific parameters (e.g., door width, hardware type, opening force). Structure varies by element_group_id.';
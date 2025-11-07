-- Add unique constraint for new element_instance pattern
-- This prevents duplicate checks for the same section within an element instance

CREATE UNIQUE INDEX unique_check_per_element_instance_section
ON checks (element_instance_id, section_id)
WHERE element_instance_id IS NOT NULL;

COMMENT ON INDEX unique_check_per_element_instance_section IS
'Ensures uniqueness of checks per element instance and section. Only applies to checks with element_instance_id (new pattern).';



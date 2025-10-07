-- Add 'insufficient_information' status to manual_override check constraint
-- This status indicates that the code IS applicable to the design, but necessary
-- information is not shown in the drawings to verify compliance.
-- Different from 'not_applicable' which means the code section isn't relevant.

-- Drop the existing constraint
ALTER TABLE checks
DROP CONSTRAINT IF EXISTS checks_manual_override_check;

-- Add the new constraint with the additional status
ALTER TABLE checks
ADD CONSTRAINT checks_manual_override_check 
CHECK (manual_override IN ('compliant', 'non_compliant', 'not_applicable', 'insufficient_information'));

-- Add comment explaining the new status
COMMENT ON COLUMN checks.manual_override IS 'Manual compliance override: compliant, non_compliant, not_applicable, insufficient_information (info not in drawings), or NULL (no override)';


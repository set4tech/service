-- Add jurisdiction field to assessments for linking to local code amendments
-- This identifies which Authority Having Jurisdiction (AHJ) applies to this assessment

ALTER TABLE assessments
ADD COLUMN jurisdiction TEXT;

-- Add index for querying assessments by jurisdiction
CREATE INDEX idx_assessments_jurisdiction ON assessments(jurisdiction);

-- Add comment explaining the column
COMMENT ON COLUMN assessments.jurisdiction IS
'Authority Having Jurisdiction (AHJ) for this assessment. Used to link to jurisdiction-specific code amendments. Examples: "Sacramento", "San Francisco", "Los Angeles", etc.';

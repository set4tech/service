-- Add pipeline_output column to store extracted PDF data from the agent pipeline
ALTER TABLE assessments
ADD COLUMN pipeline_output JSONB;

COMMENT ON COLUMN assessments.pipeline_output IS
'Complete extracted data from PDF processing pipeline (unified_document_data.json)';

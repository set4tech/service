-- Add pdf_scale column to assessments table for storing per-document resolution preference
ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS pdf_scale DECIMAL(3,1) DEFAULT 2.0;

COMMENT ON COLUMN assessments.pdf_scale IS 'PDF rendering scale multiplier (1.0-6.0) for floorplan detail viewing';

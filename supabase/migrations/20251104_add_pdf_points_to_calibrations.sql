-- Add PDF dimensions in points to calibrations table
-- These are needed for page-size calibration method to calculate real distances

ALTER TABLE pdf_scale_calibrations
ADD COLUMN IF NOT EXISTS pdf_width_points NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS pdf_height_points NUMERIC(10, 2);

COMMENT ON COLUMN pdf_scale_calibrations.pdf_width_points IS 'PDF page width in points (72 points = 1 inch)';
COMMENT ON COLUMN pdf_scale_calibrations.pdf_height_points IS 'PDF page height in points (72 points = 1 inch)';


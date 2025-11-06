-- Add print size columns for more accurate measurement calibration
-- Users specify the intended print size (e.g., 24x36 inches) instead of DPI

ALTER TABLE pdf_scale_calibrations
ADD COLUMN IF NOT EXISTS print_width_inches NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS print_height_inches NUMERIC(10, 2);

COMMENT ON COLUMN pdf_scale_calibrations.print_width_inches IS 'Intended print width in inches (e.g., 24 for 24x36 sheet)';
COMMENT ON COLUMN pdf_scale_calibrations.print_height_inches IS 'Intended print height in inches (e.g., 36 for 24x36 sheet)';




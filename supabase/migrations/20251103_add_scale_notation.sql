-- Add scale_notation column for architectural scale input
-- This allows users to just enter "1/8"=1'-0"" instead of drawing calibration lines

ALTER TABLE pdf_scale_calibrations
ADD COLUMN IF NOT EXISTS scale_notation TEXT;

-- Make the old calibration fields nullable since we now support scale-only mode
ALTER TABLE pdf_scale_calibrations
ALTER COLUMN calibration_line_start DROP NOT NULL,
ALTER COLUMN calibration_line_end DROP NOT NULL,
ALTER COLUMN known_distance_inches DROP NOT NULL;

COMMENT ON COLUMN pdf_scale_calibrations.scale_notation IS 'Architectural scale notation (e.g., "1/8\"=1''-0\"") for automatic calculation';


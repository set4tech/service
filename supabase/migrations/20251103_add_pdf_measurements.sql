-- Add PDF measurement and calibration tables for floor plan measurements
-- These tables support manual distance measurements with scale calibration

-- Table: pdf_scale_calibrations
-- Stores scale calibration data per page (pixels to real-world inches)
CREATE TABLE pdf_scale_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  pixels_per_inch NUMERIC(10, 4) NOT NULL, -- Calibration ratio: pixels per real-world inch
  calibration_line_start JSONB NOT NULL, -- {x: number, y: number} in PDF coordinates
  calibration_line_end JSONB NOT NULL, -- {x: number, y: number} in PDF coordinates
  known_distance_inches NUMERIC(10, 2) NOT NULL, -- User-entered actual distance in inches
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID, -- Future: reference to auth.users
  
  -- Constraint: Only one calibration per page per project
  CONSTRAINT unique_calibration_per_page UNIQUE (project_id, page_number)
);

-- Table: pdf_measurements
-- Stores individual measurements drawn on floor plans
CREATE TABLE pdf_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  start_point JSONB NOT NULL, -- {x: number, y: number} in PDF coordinates
  end_point JSONB NOT NULL, -- {x: number, y: number} in PDF coordinates
  pixels_distance NUMERIC(10, 2) NOT NULL, -- Raw pixel distance
  real_distance_inches NUMERIC(10, 2), -- Computed distance in inches (NULL if not calibrated)
  label TEXT, -- Optional user description (e.g., "Corridor width", "Door clearance")
  color TEXT DEFAULT '#3B82F6', -- Hex color for visual categorization
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID -- Future: reference to auth.users
);

-- Indexes for efficient queries
CREATE INDEX idx_pdf_calibrations_project_page ON pdf_scale_calibrations(project_id, page_number);
CREATE INDEX idx_pdf_measurements_project_page ON pdf_measurements(project_id, page_number);
CREATE INDEX idx_pdf_measurements_project ON pdf_measurements(project_id);

-- Comment the tables
COMMENT ON TABLE pdf_scale_calibrations IS 'Scale calibration data for converting PDF pixels to real-world measurements';
COMMENT ON TABLE pdf_measurements IS 'Manual distance measurements drawn on floor plan PDFs';
COMMENT ON COLUMN pdf_scale_calibrations.pixels_per_inch IS 'Number of PDF pixels per real-world inch (calculated from calibration line)';
COMMENT ON COLUMN pdf_measurements.real_distance_inches IS 'Calculated distance in inches using page calibration (NULL if page not calibrated)';


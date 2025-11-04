import type { Calibration } from '@/hooks/useCalibration';

/**
 * Calculate real-world distance from pixel distance using page-size calibration.
 * 
 * This method uses architectural scale notation (e.g., "1/4" = 1'-0") combined
 * with the known print dimensions of the PDF.
 * 
 * @param pixelsDistance - Distance in CSS pixels
 * @param calibration - Calibration data with scale_notation and print dimensions
 * @param cssWidth - CSS width of the canvas (for pixel-to-print-inch conversion)
 * @returns Distance in inches, or null if calculation fails
 */
export function calculateRealDistancePageSize(
  pixelsDistance: number,
  calibration: {
    scale_notation: string;
    print_width_inches: number;
    print_height_inches: number;
    pdf_width_points: number;
  },
  cssWidth: number
): number | null {
  try {
    // Parse scale notation (e.g., "1/4" = 1'-0")
    const match = calibration.scale_notation.match(
      /^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/
    );
    if (!match) return null;

    const [, paperInchStr, realFeetStr, realInchesStr] = match;

    // Parse paper inches (could be fraction like 1/8)
    let paperInches: number;
    if (paperInchStr.includes('/')) {
      const [num, denom] = paperInchStr.split('/').map(Number);
      paperInches = num / denom;
    } else {
      paperInches = parseFloat(paperInchStr);
    }

    // Parse real world measurement
    const realFeet = parseFloat(realFeetStr);
    const realInches = realInchesStr ? parseFloat(realInchesStr) : 0;
    const realTotalInches = realFeet * 12 + realInches;

    // Calculate conversion
    // CSS pixels to print inches (uses the fact that CSS width = print width)
    const pixelsPerPrintInch = cssWidth / calibration.print_width_inches;

    // Convert pixel distance to paper inches
    const paperInchesDistance = pixelsDistance / pixelsPerPrintInch;

    // Convert paper inches to real inches using architectural scale
    const scaleRatio = paperInches / realTotalInches; // paper inches per real inch
    const realInchesDistance = paperInchesDistance / scaleRatio;

    return realInchesDistance;
  } catch (error) {
    console.error('[calibration-utils] Page size calculation error:', error);
    return null;
  }
}

/**
 * Calculate real-world distance from pixel distance using known-length calibration.
 * 
 * This method uses a user-drawn line with a known real-world distance.
 * More intuitive than page-size method, works even if scale notation is unclear.
 * 
 * @param pixelsDistance - Distance in CSS pixels to convert
 * @param calibration - Calibration data with line endpoints and known distance
 * @returns Distance in inches, or null if calculation fails
 */
export function calculateRealDistanceKnownLength(
  pixelsDistance: number,
  calibration: {
    calibration_line_start: { x: number; y: number };
    calibration_line_end: { x: number; y: number };
    known_distance_inches: number;
  }
): number | null {
  try {
    // Calculate the calibration line length in pixels
    const dx = calibration.calibration_line_end.x - calibration.calibration_line_start.x;
    const dy = calibration.calibration_line_end.y - calibration.calibration_line_start.y;
    const calibrationLineLengthPixels = Math.sqrt(dx * dx + dy * dy);

    if (calibrationLineLengthPixels === 0) {
      console.warn('[calibration-utils] Calibration line has zero length');
      return null;
    }

    // pixels_per_inch = calibration line pixels / known distance inches
    const pixelsPerInch = calibrationLineLengthPixels / calibration.known_distance_inches;

    // Convert measurement pixels to real inches
    return pixelsDistance / pixelsPerInch;
  } catch (error) {
    console.error('[calibration-utils] Known length calculation error:', error);
    return null;
  }
}

/**
 * Calculate real-world distance using appropriate method based on calibration type.
 * 
 * @param pixelsDistance - Distance in CSS pixels
 * @param calibration - Calibration data (can be null)
 * @param cssWidth - CSS width of canvas (only needed for page-size method)
 * @returns Distance in inches, or null if no calibration or calculation fails
 */
export function calculateRealDistance(
  pixelsDistance: number,
  calibration: Calibration | null,
  cssWidth?: number
): number | null {
  if (!calibration) return null;

  // Try known-length method first (simpler, more direct)
  if (
    calibration.calibration_line_start &&
    calibration.calibration_line_end &&
    calibration.known_distance_inches
  ) {
    return calculateRealDistanceKnownLength(pixelsDistance, {
      calibration_line_start: calibration.calibration_line_start,
      calibration_line_end: calibration.calibration_line_end,
      known_distance_inches: calibration.known_distance_inches,
    });
  }

  // Fall back to page-size method
  if (
    calibration.scale_notation &&
    calibration.print_width_inches &&
    calibration.print_height_inches &&
    calibration.pdf_width_points &&
    cssWidth
  ) {
    return calculateRealDistancePageSize(
      pixelsDistance,
      {
        scale_notation: calibration.scale_notation,
        print_width_inches: calibration.print_width_inches,
        print_height_inches: calibration.print_height_inches,
        pdf_width_points: calibration.pdf_width_points,
      },
      cssWidth
    );
  }

  return null;
}

/**
 * Parse architectural scale notation into its components.
 * 
 * Supports formats like:
 * - "1/4" = 1'-0"
 * - "1/8" = 1'-0"
 * - "1" = 10'-0"
 * - "3/4" = 1'-6"
 * 
 * @param notation - Scale notation string
 * @returns Parsed components or null if invalid
 */
export function parseScaleNotation(notation: string): {
  paperInches: number;
  realInches: number;
} | null {
  const match = notation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
  if (!match) return null;

  const [, paperInchStr, realFeetStr, realInchesStr] = match;

  // Parse paper inches (could be fraction)
  let paperInches: number;
  if (paperInchStr.includes('/')) {
    const [num, denom] = paperInchStr.split('/').map(Number);
    paperInches = num / denom;
  } else {
    paperInches = parseFloat(paperInchStr);
  }

  // Parse real world measurement
  const realFeet = parseFloat(realFeetStr);
  const realInchesExtra = realInchesStr ? parseFloat(realInchesStr) : 0;
  const realInches = realFeet * 12 + realInchesExtra;

  return { paperInches, realInches };
}

/**
 * Format distance in inches to a human-readable string.
 * 
 * @param inches - Distance in inches
 * @param precision - Number of decimal places (default: 2)
 * @returns Formatted string like "5' 6.25"" or "14.5""
 */
export function formatDistance(inches: number, precision: number = 2): string {
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;

  if (feet > 0) {
    return `${feet}' ${remainingInches.toFixed(precision)}"`;
  }
  
  return `${inches.toFixed(precision)}"`;
}

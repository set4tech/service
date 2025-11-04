/**
 * Calibration and Measurement Calculation Library
 * 
 * Pure functions for architectural scale calculations, coordinate transformations,
 * and distance measurements. Extracted for easier testing and reusability.
 */

/**
 * Parse architectural scale notation into a ratio (paper inches per real inch)
 * 
 * @param notation - Scale notation like "1/8"=1'-0"", "1/4"=1'", "1"=10'"
 * @returns Scale ratio (paper inches / real inches) or null if invalid
 * 
 * @example
 * parseScaleNotation('1/8"=1\'-0"') // Returns 0.125 / 12 = 0.0104166...
 * parseScaleNotation('1/4"=1\'') // Returns 0.25 / 12 = 0.0208333...
 * parseScaleNotation('1"=10\'') // Returns 1 / 120 = 0.008333...
 */
export function parseScaleNotation(notation: string): number | null {
  try {
    // Match patterns like: 1/8"=1'-0", 1/4"=1', 1"=10', 3/16"=1'-0"
    const match = notation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
    if (!match) return null;

    const [, paperInchStr, realFeetStr, realInchesStr] = match;

    // Parse paper inches (could be fraction like "1/8")
    let paperInches: number;
    if (paperInchStr.includes('/')) {
      const [num, denom] = paperInchStr.split('/').map(Number);
      if (denom === 0) return null;
      paperInches = num / denom;
    } else {
      paperInches = parseFloat(paperInchStr);
    }

    // Parse real world measurement
    const realFeet = parseFloat(realFeetStr);
    const realInches = realInchesStr ? parseFloat(realInchesStr) : 0;
    const realTotalInches = realFeet * 12 + realInches;

    if (realTotalInches === 0) return null;

    // Scale ratio: paper inches per real inch
    return paperInches / realTotalInches;
  } catch {
    return null;
  }
}

/**
 * Validate architectural scale notation format
 * 
 * @param notation - Scale notation string to validate
 * @returns true if valid format, false otherwise
 */
export function isValidScaleNotation(notation: string): boolean {
  return parseScaleNotation(notation) !== null;
}

/**
 * Calculate pixels per inch using the Page Size Method
 * 
 * @param pdfWidthPoints - PDF page width in points (72 points = 1 inch)
 * @param printWidthInches - Intended print width in inches
 * @returns Pixels per inch ratio for screen coordinates
 */
export function calculatePixelsPerInchPageSize(
  pdfWidthPoints: number,
  printWidthInches: number
): number {
  // PDF spec: 72 points = 1 inch
  // When rendered, CSS pixels match PDF dimensions at 1x scale
  // printWidthInches is the real-world sheet size
  const pixelsPerPrintInch = pdfWidthPoints / printWidthInches;
  
  return pixelsPerPrintInch;
}

/**
 * Calculate pixels per inch using the Known Length Method
 * 
 * @param lineStart - Line start point {x, y} in PDF coordinates
 * @param lineEnd - Line end point {x, y} in PDF coordinates
 * @param knownDistanceInches - Known real-world distance in inches
 * @returns Pixels per inch ratio
 */
export function calculatePixelsPerInchKnownLength(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  knownDistanceInches: number
): number | null {
  if (knownDistanceInches <= 0) return null;

  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLengthPixels = Math.sqrt(dx * dx + dy * dy);

  if (lineLengthPixels === 0) return null;

  return lineLengthPixels / knownDistanceInches;
}

/**
 * Convert pixel distance to real-world inches using Page Size calibration
 * 
 * @param pixelsDistance - Distance in pixels (CSS coordinates)
 * @param scaleNotation - Architectural scale notation
 * @param cssWidth - Canvas CSS width in pixels
 * @param printWidthInches - Intended print width in inches
 * @returns Real distance in inches or null if calculation fails
 */
export function pixelsToInchesPageSize(
  pixelsDistance: number,
  scaleNotation: string,
  cssWidth: number,
  printWidthInches: number
): number | null {
  try {
    const scaleRatio = parseScaleNotation(scaleNotation);
    if (scaleRatio === null || printWidthInches <= 0 || cssWidth <= 0) return null;

    // Direct calculation: CSS pixels to print inches
    const pixelsPerPrintInch = cssWidth / printWidthInches;

    // Convert pixel distance to paper inches
    const paperInchesDistance = pixelsDistance / pixelsPerPrintInch;

    // Convert paper inches to real inches using architectural scale
    // scaleRatio = paper inches per real inch
    const realInchesDistance = paperInchesDistance / scaleRatio;

    return realInchesDistance;
  } catch {
    return null;
  }
}

/**
 * Convert pixel distance to real-world inches using Known Length calibration
 * 
 * @param pixelsDistance - Distance in pixels
 * @param pixelsPerInch - Calibrated pixels per inch ratio
 * @returns Real distance in inches
 */
export function pixelsToInchesKnownLength(
  pixelsDistance: number,
  pixelsPerInch: number
): number | null {
  if (pixelsPerInch <= 0) return null;
  return pixelsDistance / pixelsPerInch;
}

/**
 * Calculate distance between two points
 * 
 * @param start - Start point {x, y}
 * @param end - End point {x, y}
 * @returns Euclidean distance
 */
export function calculateDistance(
  start: { x: number; y: number },
  end: { x: number; y: number }
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validate print size dimensions
 * 
 * @param width - Width in inches
 * @param height - Height in inches
 * @returns true if dimensions are reasonable, false otherwise
 */
export function isValidPrintSize(width: number, height: number): boolean {
  // Validate dimensions are reasonable (1" to 100" range)
  return width >= 1 && width <= 100 && height >= 1 && height <= 100;
}

/**
 * Check if print size aspect ratio matches PDF aspect ratio (within tolerance)
 * 
 * @param printWidth - Print width in inches
 * @param printHeight - Print height in inches
 * @param pdfWidth - PDF width in points
 * @param pdfHeight - PDF height in points
 * @param tolerance - Aspect ratio tolerance (default 0.15 = 15%)
 * @returns true if aspect ratios match within tolerance
 */
export function aspectRatioMatches(
  printWidth: number,
  printHeight: number,
  pdfWidth: number,
  pdfHeight: number,
  tolerance: number = 0.15
): boolean {
  const pdfAspect = pdfWidth / pdfHeight;
  const printAspect = printWidth / printHeight;
  const diff = Math.abs(pdfAspect - printAspect) / pdfAspect;

  // Also check flipped orientation (24x36 vs 36x24)
  const flippedPrintAspect = printHeight / printWidth;
  const flippedDiff = Math.abs(pdfAspect - flippedPrintAspect) / pdfAspect;

  // Pass if either orientation matches
  return diff <= tolerance || flippedDiff <= tolerance;
}

/**
 * Auto-correct print dimensions to match PDF orientation
 * 
 * @param printWidth - Original print width
 * @param printHeight - Original print height  
 * @param pdfWidth - PDF width in points
 * @param pdfHeight - PDF height in points
 * @returns Corrected dimensions {width, height}
 */
export function autoCorrectOrientation(
  printWidth: number,
  printHeight: number,
  pdfWidth: number,
  pdfHeight: number
): { width: number; height: number } {
  const pdfIsLandscape = pdfWidth > pdfHeight;
  const printIsLandscape = printWidth > printHeight;

  // If orientations don't match, swap the print dimensions
  if (pdfIsLandscape !== printIsLandscape) {
    return { width: printHeight, height: printWidth };
  }

  return { width: printWidth, height: printHeight };
}

/**
 * Format distance in inches to architectural notation (feet and inches)
 * 
 * @param inches - Distance in inches
 * @param precision - Decimal places for inches (default 1)
 * @returns Formatted string like "10'-6.5"" or "0'-8.2""
 */
export function formatDistanceArchitectural(
  inches: number,
  precision: number = 1
): string {
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return `${feet}'-${remainingInches.toFixed(precision)}"`;
}

/**
 * Format distance in inches to metric (centimeters)
 * 
 * @param inches - Distance in inches
 * @param precision - Decimal places (default 1)
 * @returns Formatted string like "123.4 cm"
 */
export function formatDistanceMetric(
  inches: number,
  precision: number = 1
): string {
  const cm = inches * 2.54;
  return `${cm.toFixed(precision)} cm`;
}

/**
 * Common architectural sheet sizes (width x height in inches)
 */
export const COMMON_SHEET_SIZES = {
  LETTER: { width: 8.5, height: 11, label: 'Letter (8.5×11)' },
  TABLOID: { width: 11, height: 17, label: 'Tabloid (11×17)' },
  ANSI_C: { width: 17, height: 22, label: 'ANSI C (17×22)' },
  ANSI_D: { width: 24, height: 36, label: 'ANSI D (24×36)' },
  ANSI_E: { width: 36, height: 48, label: 'ANSI E (36×48)' },
  ARCH_D: { width: 24, height: 36, label: 'Arch D (24×36)' },
  ARCH_E: { width: 36, height: 48, label: 'Arch E (36×48)' },
} as const;

/**
 * Common architectural scales
 */
export const COMMON_SCALES = [
  { notation: '1/8"=1\'-0"', label: '1/8" = 1\'-0"' },
  { notation: '1/4"=1\'-0"', label: '1/4" = 1\'-0"' },
  { notation: '3/16"=1\'-0"', label: '3/16" = 1\'-0"' },
  { notation: '1/2"=1\'-0"', label: '1/2" = 1\'-0"' },
  { notation: '3/4"=1\'-0"', label: '3/4" = 1\'-0"' },
  { notation: '1"=1\'-0"', label: '1" = 1\'-0"' },
] as const;


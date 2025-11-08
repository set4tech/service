import { describe, it, expect } from 'vitest';
import {
  parseScaleNotation,
  isValidScaleNotation,
  calculatePixelsPerInchPageSize,
  calculatePixelsPerInchKnownLength,
  pixelsToInchesPageSize,
  pixelsToInchesKnownLength,
  calculateDistance,
  isValidPrintSize,
  aspectRatioMatches,
  autoCorrectOrientation,
  formatDistanceArchitectural,
  formatDistanceMetric,
} from '@/lib/calibration-calculations';

describe('parseScaleNotation', () => {
  it('should parse standard fractional scales', () => {
    // 1/8" = 1'-0" means 0.125 inches on paper = 12 inches real
    expect(parseScaleNotation('1/8"=1\'-0"')).toBeCloseTo(0.125 / 12, 6);

    // 1/4" = 1'-0" means 0.25 inches on paper = 12 inches real
    expect(parseScaleNotation('1/4"=1\'-0"')).toBeCloseTo(0.25 / 12, 6);

    // 3/16" = 1'-0" means 0.1875 inches on paper = 12 inches real
    expect(parseScaleNotation('3/16"=1\'-0"')).toBeCloseTo(0.1875 / 12, 6);
  });

  it('should parse scales with feet and inches', () => {
    // 1/8" = 1'-6" means 0.125 inches on paper = 18 inches real
    expect(parseScaleNotation('1/8"=1\'-6"')).toBeCloseTo(0.125 / 18, 6);
  });

  it('should parse whole number scales', () => {
    // 1" = 1'-0" means 1 inch on paper = 12 inches real
    expect(parseScaleNotation('1"=1\'-0"')).toBeCloseTo(1 / 12, 6);

    // 1" = 10' means 1 inch on paper = 120 inches real
    expect(parseScaleNotation('1"=10\'')).toBeCloseTo(1 / 120, 6);
  });

  it('should handle various whitespace', () => {
    expect(parseScaleNotation('1/8" = 1\'-0"')).toBeCloseTo(0.125 / 12, 6);
    expect(parseScaleNotation('1/8"= 1\'-0"')).toBeCloseTo(0.125 / 12, 6);
    expect(parseScaleNotation('1/8" =1\'-0"')).toBeCloseTo(0.125 / 12, 6);
  });

  it('should return null for invalid formats', () => {
    expect(parseScaleNotation('')).toBeNull();
    expect(parseScaleNotation('invalid')).toBeNull();
    expect(parseScaleNotation('1/8')).toBeNull();
    expect(parseScaleNotation('1" = 1m')).toBeNull();
    expect(parseScaleNotation('abc"=1\'-0"')).toBeNull();
  });

  it('should return null for division by zero', () => {
    expect(parseScaleNotation('1/0"=1\'-0"')).toBeNull();
    expect(parseScaleNotation('1"=0\'-0"')).toBeNull();
  });
});

describe('isValidScaleNotation', () => {
  it('should return true for valid scales', () => {
    expect(isValidScaleNotation('1/8"=1\'-0"')).toBe(true);
    expect(isValidScaleNotation('1/4"=1\'')).toBe(true);
    expect(isValidScaleNotation('1"=10\'')).toBe(true);
  });

  it('should return false for invalid scales', () => {
    expect(isValidScaleNotation('')).toBe(false);
    expect(isValidScaleNotation('invalid')).toBe(false);
    expect(isValidScaleNotation('1/0"=1\'-0"')).toBe(false);
  });
});

describe('calculatePixelsPerInchPageSize', () => {
  it('should calculate pixels per inch for standard page sizes', () => {
    // 24x36 sheet: 24*72 = 1728 PDF points width
    // Print width = 24 inches
    // Pixels per print inch = 1728 / 24 = 72
    expect(calculatePixelsPerInchPageSize(1728, 24)).toBe(72);

    // 11x17 sheet: 11*72 = 792 PDF points width
    // Print width = 11 inches
    expect(calculatePixelsPerInchPageSize(792, 11)).toBe(72);
  });

  it('should handle different print sizes', () => {
    // PDF is 1728 points (24 inches), but printed at 12 inches (half size)
    // Pixels per print inch should be 144
    expect(calculatePixelsPerInchPageSize(1728, 12)).toBe(144);
  });
});

describe('calculatePixelsPerInchKnownLength', () => {
  it('should calculate pixels per inch from a horizontal line', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 720, y: 0 };
    const knownDistance = 10; // 10 inches real

    // 720 pixels / 10 inches = 72 pixels per inch
    expect(calculatePixelsPerInchKnownLength(start, end, knownDistance)).toBe(72);
  });

  it('should calculate pixels per inch from a vertical line', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 360 };
    const knownDistance = 5; // 5 inches real

    // 360 pixels / 5 inches = 72 pixels per inch
    expect(calculatePixelsPerInchKnownLength(start, end, knownDistance)).toBe(72);
  });

  it('should calculate pixels per inch from a diagonal line', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 300, y: 400 };
    const knownDistance = 10; // 10 inches real

    // Distance = sqrt(300^2 + 400^2) = 500 pixels
    // 500 / 10 = 50 pixels per inch
    const result = calculatePixelsPerInchKnownLength(start, end, knownDistance);
    expect(result).toBeCloseTo(50, 2);
  });

  it('should return null for zero length line', () => {
    const start = { x: 100, y: 100 };
    const end = { x: 100, y: 100 };

    expect(calculatePixelsPerInchKnownLength(start, end, 10)).toBeNull();
  });

  it('should return null for zero or negative known distance', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };

    expect(calculatePixelsPerInchKnownLength(start, end, 0)).toBeNull();
    expect(calculatePixelsPerInchKnownLength(start, end, -5)).toBeNull();
  });
});

describe('pixelsToInchesPageSize', () => {
  it('should convert pixels to real inches at 1/8" scale', () => {
    // 1/8" = 1'-0" scale on 24" wide sheet
    // PDF is 1728 points (24 inches) rendered as 1728 CSS pixels
    const pixelsDistance = 144; // pixels measured
    const scaleNotation = '1/8"=1\'-0"';
    const cssWidth = 1728; // CSS pixels
    const printWidth = 24; // inches

    // Step 1: pixels to paper inches
    // pixelsPerPrintInch = 1728 / 24 = 72
    // paperInches = 144 / 72 = 2 inches on paper

    // Step 2: paper inches to real inches using scale
    // scale ratio = 0.125 / 12 = 0.0104166...
    // realInches = 2 / 0.0104166... = 192 inches (16 feet)

    const result = pixelsToInchesPageSize(pixelsDistance, scaleNotation, cssWidth, printWidth);
    expect(result).toBeCloseTo(192, 1); // 16 feet = 192 inches
  });

  it('should convert pixels to real inches at 1/4" scale', () => {
    // 1/4" = 1'-0" scale on 24" wide sheet
    const pixelsDistance = 72; // 1 inch on paper at 72 ppi
    const scaleNotation = '1/4"=1\'-0"';
    const cssWidth = 1728;
    const printWidth = 24;

    // paperInches = 72 / 72 = 1 inch
    // scale ratio = 0.25 / 12 = 0.0208333...
    // realInches = 1 / 0.0208333... = 48 inches (4 feet)

    const result = pixelsToInchesPageSize(pixelsDistance, scaleNotation, cssWidth, printWidth);
    expect(result).toBeCloseTo(48, 1); // 4 feet = 48 inches
  });

  it('should return null for invalid scale notation', () => {
    const result = pixelsToInchesPageSize(100, 'invalid', 1000, 24);
    expect(result).toBeNull();
  });

  it('should return null for invalid dimensions', () => {
    expect(pixelsToInchesPageSize(100, '1/8"=1\'-0"', 0, 24)).toBeNull();
    expect(pixelsToInchesPageSize(100, '1/8"=1\'-0"', 1000, 0)).toBeNull();
    expect(pixelsToInchesPageSize(100, '1/8"=1\'-0"', -1000, 24)).toBeNull();
  });
});

describe('pixelsToInchesKnownLength', () => {
  it('should convert pixels to inches using calibration', () => {
    const pixelsDistance = 360;
    const pixelsPerInch = 72;

    // 360 / 72 = 5 inches
    expect(pixelsToInchesKnownLength(pixelsDistance, pixelsPerInch)).toBe(5);
  });

  it('should handle fractional results', () => {
    const pixelsDistance = 100;
    const pixelsPerInch = 72;

    // 100 / 72 ≈ 1.389 inches
    const result = pixelsToInchesKnownLength(pixelsDistance, pixelsPerInch);
    expect(result).toBeCloseTo(1.389, 3);
  });

  it('should return null for invalid pixels per inch', () => {
    expect(pixelsToInchesKnownLength(100, 0)).toBeNull();
    expect(pixelsToInchesKnownLength(100, -72)).toBeNull();
  });
});

describe('calculateDistance', () => {
  it('should calculate horizontal distance', () => {
    expect(calculateDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(100);
  });

  it('should calculate vertical distance', () => {
    expect(calculateDistance({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(100);
  });

  it('should calculate diagonal distance', () => {
    // 3-4-5 triangle: sqrt(3^2 + 4^2) = 5
    expect(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);

    // sqrt(300^2 + 400^2) = 500
    expect(calculateDistance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
  });

  it('should handle negative coordinates', () => {
    expect(calculateDistance({ x: -50, y: -50 }, { x: 50, y: 50 })).toBeCloseTo(141.42, 2);
  });

  it('should return 0 for same points', () => {
    expect(calculateDistance({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(0);
  });
});

describe('isValidPrintSize', () => {
  it('should accept common sheet sizes', () => {
    expect(isValidPrintSize(8.5, 11)).toBe(true); // Letter
    expect(isValidPrintSize(11, 17)).toBe(true); // Tabloid
    expect(isValidPrintSize(24, 36)).toBe(true); // ANSI D
    expect(isValidPrintSize(36, 48)).toBe(true); // ANSI E
  });

  it('should reject dimensions outside valid range', () => {
    expect(isValidPrintSize(0.5, 11)).toBe(false); // Too small
    expect(isValidPrintSize(8.5, 0.5)).toBe(false); // Too small
    expect(isValidPrintSize(150, 36)).toBe(false); // Too large
    expect(isValidPrintSize(24, 150)).toBe(false); // Too large
  });

  it('should reject zero or negative dimensions', () => {
    expect(isValidPrintSize(0, 11)).toBe(false);
    expect(isValidPrintSize(8.5, 0)).toBe(false);
    expect(isValidPrintSize(-8.5, 11)).toBe(false);
    expect(isValidPrintSize(8.5, -11)).toBe(false);
  });
});

describe('aspectRatioMatches', () => {
  it('should match exact aspect ratios', () => {
    // 24x36 print matches 1728x2592 PDF (both are 2:3 ratio)
    expect(aspectRatioMatches(24, 36, 1728, 2592)).toBe(true);
  });

  it('should match flipped orientations', () => {
    // 36x24 print (landscape) matches 1728x2592 PDF (portrait)
    expect(aspectRatioMatches(36, 24, 1728, 2592)).toBe(true);
  });

  it('should accept aspect ratios within tolerance', () => {
    // Slightly off aspect ratio but within 15% tolerance
    expect(aspectRatioMatches(24, 36, 1728, 2500, 0.15)).toBe(true);
  });

  it('should reject aspect ratios outside tolerance', () => {
    // Very different aspect ratios (4:3 vs 16:9)
    expect(aspectRatioMatches(8, 6, 1920, 1080, 0.15)).toBe(false);
  });

  it('should work with custom tolerance', () => {
    // Stricter tolerance (3.5% diff, within 5% = should pass)
    expect(aspectRatioMatches(24, 36, 1728, 2500, 0.05)).toBe(true);

    // Very strict tolerance (3.5% diff, outside 2% = should fail)
    expect(aspectRatioMatches(24, 36, 1728, 2500, 0.02)).toBe(false);

    // Looser tolerance
    expect(aspectRatioMatches(24, 36, 1728, 2500, 0.25)).toBe(true);
  });
});

describe('autoCorrectOrientation', () => {
  it('should not swap when orientations match', () => {
    // Both landscape
    const result1 = autoCorrectOrientation(36, 24, 2592, 1728);
    expect(result1).toEqual({ width: 36, height: 24 });

    // Both portrait
    const result2 = autoCorrectOrientation(24, 36, 1728, 2592);
    expect(result2).toEqual({ width: 24, height: 36 });
  });

  it('should swap when orientations differ', () => {
    // Print is portrait, PDF is landscape - should swap
    const result1 = autoCorrectOrientation(24, 36, 2592, 1728);
    expect(result1).toEqual({ width: 36, height: 24 });

    // Print is landscape, PDF is portrait - should swap
    const result2 = autoCorrectOrientation(36, 24, 1728, 2592);
    expect(result2).toEqual({ width: 24, height: 36 });
  });

  it('should handle square dimensions', () => {
    // Square PDF, any orientation should stay the same
    const result1 = autoCorrectOrientation(24, 24, 1728, 1728);
    expect(result1).toEqual({ width: 24, height: 24 });
  });
});

describe('formatDistanceArchitectural', () => {
  it('should format distances in feet and inches', () => {
    expect(formatDistanceArchitectural(12)).toBe('1\'-0.0"'); // 1 foot
    expect(formatDistanceArchitectural(24)).toBe('2\'-0.0"'); // 2 feet
    expect(formatDistanceArchitectural(18)).toBe('1\'-6.0"'); // 1 foot 6 inches
  });

  it('should handle fractional inches', () => {
    expect(formatDistanceArchitectural(12.5)).toBe('1\'-0.5"');
    expect(formatDistanceArchitectural(18.75)).toBe('1\'-6.8"'); // 6.75 rounded to 1 decimal
  });

  it('should handle inches less than 1 foot', () => {
    expect(formatDistanceArchitectural(6)).toBe('0\'-6.0"');
    expect(formatDistanceArchitectural(0.5)).toBe('0\'-0.5"');
  });

  it('should respect precision parameter', () => {
    expect(formatDistanceArchitectural(18.75, 0)).toBe('1\'-7"'); // Rounded
    expect(formatDistanceArchitectural(18.75, 2)).toBe('1\'-6.75"');
  });
});

describe('formatDistanceMetric', () => {
  it('should convert inches to centimeters', () => {
    // 1 inch = 2.54 cm
    expect(formatDistanceMetric(1)).toBe('2.5 cm');
    expect(formatDistanceMetric(10)).toBe('25.4 cm');
  });

  it('should handle fractional inches', () => {
    expect(formatDistanceMetric(1.5)).toBe('3.8 cm');
  });

  it('should respect precision parameter', () => {
    expect(formatDistanceMetric(10, 0)).toBe('25 cm');
    expect(formatDistanceMetric(10, 2)).toBe('25.40 cm');
  });
});

describe('Edge cases and precision', () => {
  it('should handle very small distances', () => {
    const result = pixelsToInchesKnownLength(0.1, 72);
    expect(result).toBeCloseTo(0.00139, 5);
  });

  it('should handle very large distances', () => {
    const result = pixelsToInchesKnownLength(10000, 72);
    expect(result).toBeCloseTo(138.89, 2);
  });

  it('should maintain precision through full calculation chain', () => {
    // Start with a known measurement
    const start = { x: 0, y: 0 };
    const end = { x: 720, y: 0 };
    const knownInches = 120; // 10 feet

    // Calculate calibration
    const ppi = calculatePixelsPerInchKnownLength(start, end, knownInches);
    expect(ppi).toBe(6); // 720 / 120 = 6 pixels per inch

    // Measure a new distance
    const measuredPixels = 360;
    const realInches = pixelsToInchesKnownLength(measuredPixels, ppi!);

    // Should be exactly 60 inches (5 feet)
    expect(realInches).toBe(60);
  });
});

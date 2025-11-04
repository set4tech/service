import {
  calculateRealDistancePageSize,
  calculateRealDistanceKnownLength,
  calculateRealDistance,
  parseScaleNotation,
  formatDistance,
} from '@/lib/pdf/calibration-utils';
import { describe, it, expect } from 'vitest';

describe('calibration-utils', () => {
  describe('calculateRealDistanceKnownLength', () => {
    it('should calculate distance correctly', () => {
      const result = calculateRealDistanceKnownLength(200, {
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 100, y: 0 },
        known_distance_inches: 48, // 4 feet
      });

      // 200 pixels, calibration is 100px = 48", so 200px = 96"
      expect(result).toBeCloseTo(96, 1);
    });

    it('should handle diagonal lines', () => {
      const result = calculateRealDistanceKnownLength(
        Math.sqrt(200), // ~14.14 pixels
        {
          calibration_line_start: { x: 0, y: 0 },
          calibration_line_end: { x: 10, y: 10 }, // Length = sqrt(200)
          known_distance_inches: 12, // 1 foot
        }
      );

      expect(result).toBeCloseTo(12, 1);
    });

    it('should return null for zero-length calibration line', () => {
      const result = calculateRealDistanceKnownLength(100, {
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 0, y: 0 },
        known_distance_inches: 48,
      });

      expect(result).toBeNull();
    });
  });

  describe('calculateRealDistancePageSize', () => {
    it('should calculate 1/4" scale correctly', () => {
      // 1/4" = 1'-0" means 0.25" on paper = 12" in real life
      // Scale ratio: 0.25 / 12 = 0.0208333
      
      const result = calculateRealDistancePageSize(
        400, // pixels
        {
          scale_notation: '1/4" = 1\'-0"',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792 // CSS width matches PDF points
      );

      // 400px / (792px / 11") = 5.55" on paper
      // 5.55" / 0.0208333 = 266.4" real = 22.2 feet
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should handle 1/8" scale', () => {
      const result = calculateRealDistancePageSize(
        200,
        {
          scale_notation: '1/8" = 1\'-0"',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792
      );

      // 1/8" = 1'-0" means 0.125" on paper = 12" in real life
      // 200px / (792/11) = 2.78" on paper
      // 2.78" / (0.125/12) = 266.4" real
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should return null for invalid scale notation', () => {
      const result = calculateRealDistancePageSize(
        100,
        {
          scale_notation: 'invalid',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792
      );

      expect(result).toBeNull();
    });
  });

  describe('calculateRealDistance', () => {
    it('should prefer known-length method', () => {
      const calibration = {
        id: '1',
        project_id: 'p1',
        page_number: 1,
        method: 'known-length' as const,
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 100, y: 0 },
        known_distance_inches: 48,
        scale_notation: '1/4" = 1\'-0"',
        print_width_inches: 11,
        print_height_inches: 8.5,
        pdf_width_points: 792,
        created_at: new Date().toISOString(),
      };

      const result = calculateRealDistance(200, calibration, 792);

      // Should use known-length: 200px with 100px = 48" → 96"
      expect(result).toBeCloseTo(96, 1);
    });

    it('should fall back to page-size method', () => {
      const calibration = {
        id: '1',
        project_id: 'p1',
        page_number: 1,
        method: 'page-size' as const,
        scale_notation: '1/4" = 1\'-0"',
        print_width_inches: 11,
        print_height_inches: 8.5,
        pdf_width_points: 792,
        created_at: new Date().toISOString(),
      };

      const result = calculateRealDistance(400, calibration, 792);

      // Should use page-size method
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should return null with no calibration', () => {
      expect(calculateRealDistance(100, null)).toBeNull();
    });
  });

  describe('parseScaleNotation', () => {
    it('should parse 1/4" scale', () => {
      const result = parseScaleNotation('1/4" = 1\'-0"');
      expect(result).toEqual({
        paperInches: 0.25,
        realInches: 12,
      });
    });

    it('should parse 1/8" scale', () => {
      const result = parseScaleNotation('1/8" = 1\'-0"');
      expect(result).toEqual({
        paperInches: 0.125,
        realInches: 12,
      });
    });

    it('should parse scale with inches', () => {
      const result = parseScaleNotation('1/4" = 1\'-6"');
      expect(result).toEqual({
        paperInches: 0.25,
        realInches: 18,
      });
    });

    it('should handle whole numbers', () => {
      const result = parseScaleNotation('1" = 10\'-0"');
      expect(result).toEqual({
        paperInches: 1,
        realInches: 120,
      });
    });

    it('should return null for invalid format', () => {
      expect(parseScaleNotation('invalid')).toBeNull();
      expect(parseScaleNotation('1/4')).toBeNull();
      expect(parseScaleNotation('')).toBeNull();
    });
  });

  describe('formatDistance', () => {
    it('should format feet and inches', () => {
      expect(formatDistance(66)).toBe('5\' 6.00"');
      expect(formatDistance(18.5)).toBe('1\' 6.50"');
    });

    it('should format inches only', () => {
      expect(formatDistance(11.75)).toBe('11.75"');
      expect(formatDistance(3.5)).toBe('3.50"');
    });

    it('should respect precision', () => {
      expect(formatDistance(66, 1)).toBe('5\' 6.0"');
      expect(formatDistance(66, 3)).toBe('5\' 6.000"');
    });

    it('should handle zero', () => {
      expect(formatDistance(0)).toBe('0.00"');
    });
  });
});


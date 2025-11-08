import { useCallback } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';
import type { HookReturn } from '@/lib/hooks/types';
import { calculateRealDistance as calcDistance } from '@/lib/pdf/calibration-utils';

export interface Calibration {
  id: string;
  project_id: string;
  page_number: number;
  method: 'page-size' | 'known-length';
  scale_notation?: string;
  print_width_inches?: number;
  print_height_inches?: number;
  pdf_width_points?: number;
  pdf_height_points?: number;
  calibration_line_start?: { x: number; y: number };
  calibration_line_end?: { x: number; y: number };
  known_distance_inches?: number;
  created_at: string;
}

interface CalibrationState {
  calibration: Calibration | null;
  loading: boolean;
  error: string | null;
}

interface CalibrationActions {
  savePageSize: (
    scaleNotation: string,
    printWidth: number,
    printHeight: number,
    pdfWidth: number,
    pdfHeight: number
  ) => Promise<void>;
  saveKnownLength: (
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    knownDistanceInches: number
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

interface CalibrationComputed {
  /**
   * Calculate real-world distance from pixel distance using current calibration.
   * Returns null if no calibration is set.
   *
   * @param pixelsDistance - Distance in pixels to convert
   * @param cssWidth - CSS width of the canvas (required for page-size method)
   */
  calculateRealDistance: (pixelsDistance: number, cssWidth?: number) => number | null;
}

/**
 * Hook for managing PDF page calibration.
 *
 * Supports two calibration methods:
 * 1. Page Size Method: Uses architectural scale notation (e.g., "1/4" = 1'-0")
 * 2. Known Length Method: Uses a drawn line with known real-world distance
 *
 * @param projectId - Project UUID
 * @param pageNumber - Page number to fetch calibration for
 * @param initialData - Pre-loaded calibration (skips initial fetch if provided)
 *
 * @example
 * ```typescript
 * const calibration = useCalibration(projectId, pageNumber);
 *
 * // Method 1: Page size calibration
 * await calibration.actions.savePageSize(
 *   '1/4" = 1\'-0"',  // Scale notation
 *   11,               // Print width in inches
 *   8.5,              // Print height in inches
 *   792,              // PDF width in points
 *   612               // PDF height in points
 * );
 *
 * // Method 2: Known length calibration
 * await calibration.actions.saveKnownLength(
 *   { x: 100, y: 200 },  // Line start
 *   { x: 500, y: 200 },  // Line end
 *   48                   // Known distance: 48 inches (4 feet)
 * );
 *
 * // Calculate real distance
 * const pixels = 200;
 * const inches = calibration.computed.calculateRealDistance(pixels);
 * ```
 */
export function useCalibration(
  projectId: string | undefined,
  pageNumber: number,
  initialData?: Calibration | null
): HookReturn<CalibrationState, CalibrationActions, CalibrationComputed> {
  // Skip fetch if initialData is provided
  const shouldFetch = initialData === undefined && projectId;

  const { data, loading, error, refetch } = useFetch<{ calibration: Calibration | null }>(
    shouldFetch
      ? `/api/measurements/calibrate?projectId=${projectId}&pageNumber=${pageNumber}`
      : null
  );

  const calibration = initialData !== undefined ? initialData : (data?.calibration ?? null);

  const savePageSize = useCallback(
    async (
      scaleNotation: string,
      printWidth: number,
      printHeight: number,
      pdfWidth: number,
      pdfHeight: number
    ) => {
      if (!projectId) throw new Error('Project ID required');

      const response = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: pageNumber,
          method: 'page-size',
          scale_notation: scaleNotation,
          print_width_inches: printWidth,
          print_height_inches: printHeight,
          pdf_width_points: pdfWidth,
          pdf_height_points: pdfHeight,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save calibration');
      }

      await refetch();
    },
    [projectId, pageNumber, refetch]
  );

  const saveKnownLength = useCallback(
    async (
      lineStart: { x: number; y: number },
      lineEnd: { x: number; y: number },
      knownDistanceInches: number
    ) => {
      if (!projectId) throw new Error('Project ID required');

      const response = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: pageNumber,
          method: 'known-length',
          calibration_line_start: lineStart,
          calibration_line_end: lineEnd,
          known_distance_inches: knownDistanceInches,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save calibration');
      }

      await refetch();
    },
    [projectId, pageNumber, refetch]
  );

  const calculateRealDistance = useCallback(
    (pixelsDistance: number, cssWidth?: number): number | null => {
      return calcDistance(pixelsDistance, calibration, cssWidth);
    },
    [calibration]
  );

  return {
    state: {
      calibration,
      loading,
      error,
    },
    actions: {
      savePageSize,
      saveKnownLength,
      refresh: refetch,
    },
    computed: {
      calculateRealDistance,
    },
  };
}

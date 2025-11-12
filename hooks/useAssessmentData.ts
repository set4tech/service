import { useMemo } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';
import type { Measurement } from './useMeasurements';
import type { Calibration } from './useCalibration';

interface Screenshot {
  id: string;
  page_number: number;
  crop_coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom_level: number;
  };
  screenshot_url: string;
  thumbnail_url: string;
  caption: string;
  screenshot_type: 'plan' | 'elevation';
  created_at: string;
  check_id?: string | null;
  is_original?: boolean;
  check_section_number?: string | null;
  check_section_title?: string | null;
}

interface AssessmentDataResponse {
  success: boolean;
  data: {
    measurements: Measurement[] | null;
    calibration: Calibration | null;
    screenshots: Screenshot[] | null;
    pdf_scale: number | null;
  };
}

interface AssessmentDataState {
  measurements: Measurement[];
  calibration: Calibration | null;
  screenshots: Screenshot[];
  allScreenshots: Screenshot[];
  pdf_scale: number;
  loading: boolean;
  error: string | null;
}

interface AssessmentDataActions {
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching all assessment-related data in a single request.
 *
 * This consolidates multiple API calls into one to improve performance
 * on initial page load. Use individual hooks (useMeasurements, useCalibration, etc.)
 * for mutations and targeted refetches.
 *
 * @param assessmentId - Assessment UUID
 * @param projectId - Project UUID (required for measurements/calibration)
 * @param pageNumber - Page number to fetch data for
 * @param enabled - Whether to fetch data (default: true)
 *
 * @example
 * ```typescript
 * const assessmentData = useAssessmentData(assessmentId, projectId, pageNumber);
 *
 * // Access data
 * const measurements = assessmentData.state.measurements;
 * const calibration = assessmentData.state.calibration;
 * const screenshots = assessmentData.state.screenshots;
 * const pdfScale = assessmentData.state.pdf_scale;
 *
 * // Refresh all data
 * await assessmentData.actions.refresh();
 * ```
 */
export function useAssessmentData(
  assessmentId: string | undefined,
  projectId: string | undefined,
  pageNumber: number,
  enabled: boolean = true
): { state: AssessmentDataState; actions: AssessmentDataActions } {
  // Build URL with query parameters
  const url = useMemo(() => {
    if (!assessmentId || !enabled) return null;

    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    params.append('pageNumber', pageNumber.toString());

    return `/api/assessments/${assessmentId}?${params.toString()}`;
  }, [assessmentId, projectId, pageNumber, enabled]);

  const { data, loading, error, refetch } = useFetch<AssessmentDataResponse>(url, {
    enabled,
  });

  // Filter screenshots to current page
  const screenshots = useMemo(() => {
    if (!data?.data?.screenshots) return [];
    return data.data.screenshots.filter(s => s.page_number === pageNumber);
  }, [data?.data?.screenshots, pageNumber]);

  return {
    state: {
      measurements: data?.data?.measurements || [],
      calibration: data?.data?.calibration || null,
      screenshots,
      allScreenshots: data?.data?.screenshots || [],
      pdf_scale: data?.data?.pdf_scale || 2.0,
      loading,
      error,
    },
    actions: {
      refresh: refetch,
    },
  };
}

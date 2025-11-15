import { useMemo, useCallback } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';

interface CropCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom_level: number;
}

interface Screenshot {
  id: string;
  page_number: number;
  crop_coordinates: CropCoordinates;
  screenshot_url: string;
  thumbnail_url: string;
  caption: string;
  screenshot_type: 'plan' | 'elevation';
  created_at: string;
}

/**
 * Custom hook to fetch and manage screenshots for an assessment.
 * Returns screenshots filtered by the current page number.
 *
 * @param assessmentId - Assessment UUID
 * @param currentPage - Current page number to filter screenshots
 * @param initialData - Pre-loaded screenshots (skips initial fetch if provided)
 */
export function useAssessmentScreenshots(
  assessmentId: string | undefined,
  currentPage: number,
  initialData?: Screenshot[]
) {
  // Always provide URL so refetch works, but skip initial fetch if we have initialData
  const url = assessmentId ? `/api/screenshots?assessment_id=${assessmentId}` : null;
  const shouldSkipInitialFetch = !!initialData;

  // Use the shared fetch hook
  const { data, loading, refetch } = useFetch<{ screenshots: Screenshot[] }>(url, {
    enabled: !shouldSkipInitialFetch, // Skip initial fetch if we have initialData
  });

  const allScreenshots = initialData || data?.screenshots || [];

  // Filter screenshots to only those on the current page
  const screenshots = useMemo(
    () => allScreenshots.filter(s => s.page_number === currentPage),
    [allScreenshots, currentPage]
  );

  // Memoize refresh to prevent infinite render loops
  const refresh = useCallback(async () => {
    console.log('[useAssessmentScreenshots] refresh called');
    await refetch();
    console.log('[useAssessmentScreenshots] refresh completed');
  }, [refetch]);

  return {
    state: {
      screenshots,
      allScreenshots,
      loading,
    },
    actions: {
      refresh,
    },
  };
}

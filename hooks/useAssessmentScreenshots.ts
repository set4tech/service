import { useMemo } from 'react';
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
 */
export function useAssessmentScreenshots(assessmentId: string | undefined, currentPage: number) {
  // Use the shared fetch hook
  const { data, loading, refetch } = useFetch<{ screenshots: Screenshot[] }>(
    assessmentId ? `/api/screenshots?assessment_id=${assessmentId}` : null
  );

  const allScreenshots = data?.screenshots ?? [];

  // Filter screenshots to only those on the current page
  const screenshots = useMemo(
    () => allScreenshots.filter(s => s.page_number === currentPage),
    [allScreenshots, currentPage]
  );

  return {
    state: {
      screenshots,
      allScreenshots,
      loading,
    },
    actions: {
      refresh: refetch,
    },
  };
}

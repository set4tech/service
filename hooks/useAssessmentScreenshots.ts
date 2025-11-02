import { useEffect, useState, useCallback } from 'react';

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
  const [allScreenshots, setAllScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchScreenshots = useCallback(async () => {
    if (!assessmentId) {
      setAllScreenshots([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/screenshots?assessment_id=${assessmentId}`);
      if (!response.ok) {
        console.error('[useAssessmentScreenshots] Failed to fetch screenshots:', response.status);
        return;
      }

      const data = await response.json();
      setAllScreenshots(data.screenshots || []);
    } catch (error) {
      console.error('[useAssessmentScreenshots] Error fetching screenshots:', error);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  // Fetch screenshots on mount and when assessmentId changes
  useEffect(() => {
    fetchScreenshots();
  }, [fetchScreenshots]);

  // Filter screenshots to only those on the current page
  const screenshots = allScreenshots.filter(s => s.page_number === currentPage);

  return {
    screenshots,
    allScreenshots,
    loading,
    refresh: fetchScreenshots,
  };
}

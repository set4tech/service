import { renderHook, waitFor } from '@testing-library/react';
import { useAssessmentData } from '@/hooks/useAssessmentData';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

describe('useAssessmentData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch consolidated assessment data', async () => {
    const mockResponse = {
      success: true,
      data: {
        measurements: [
          {
            id: 'measurement-1',
            project_id: 'project-1',
            page_number: 1,
            start_point: { x: 100, y: 100 },
            end_point: { x: 200, y: 100 },
            pixels_distance: 100,
            real_distance_inches: 10,
          },
        ],
        calibration: {
          id: 'calibration-1',
          project_id: 'project-1',
          page_number: 1,
          method: 'known-length',
          pixels_per_inch: 10,
        },
        screenshots: [
          {
            id: 'screenshot-1',
            page_number: 1,
            crop_coordinates: { x: 0, y: 0, width: 100, height: 100, zoom_level: 1 },
            screenshot_url: 's3://bucket/screenshot-1.jpg',
            thumbnail_url: 's3://bucket/screenshot-1-thumb.jpg',
            caption: 'Test screenshot',
            screenshot_type: 'plan' as const,
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'screenshot-2',
            page_number: 2,
            crop_coordinates: { x: 0, y: 0, width: 100, height: 100, zoom_level: 1 },
            screenshot_url: 's3://bucket/screenshot-2.jpg',
            thumbnail_url: 's3://bucket/screenshot-2-thumb.jpg',
            caption: 'Test screenshot 2',
            screenshot_type: 'plan' as const,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        pdf_scale: 4.0,
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 1, true));

    expect(result.current.state.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.measurements).toHaveLength(1);
    expect(result.current.state.calibration).toBeDefined();
    expect(result.current.state.calibration?.id).toBe('calibration-1');
    expect(result.current.state.screenshots).toHaveLength(1); // Filtered to page 1
    expect(result.current.state.allScreenshots).toHaveLength(2); // All screenshots
    expect(result.current.state.pdf_scale).toBe(4.0);
    expect(result.current.state.error).toBeNull();
  });

  it('should filter screenshots to current page', async () => {
    const mockResponse = {
      success: true,
      data: {
        measurements: [],
        calibration: null,
        screenshots: [
          {
            id: 'screenshot-1',
            page_number: 1,
            crop_coordinates: { x: 0, y: 0, width: 100, height: 100, zoom_level: 1 },
            screenshot_url: 's3://bucket/screenshot-1.jpg',
            thumbnail_url: 's3://bucket/screenshot-1-thumb.jpg',
            caption: 'Page 1',
            screenshot_type: 'plan' as const,
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'screenshot-2',
            page_number: 2,
            crop_coordinates: { x: 0, y: 0, width: 100, height: 100, zoom_level: 1 },
            screenshot_url: 's3://bucket/screenshot-2.jpg',
            thumbnail_url: 's3://bucket/screenshot-2-thumb.jpg',
            caption: 'Page 2',
            screenshot_type: 'plan' as const,
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'screenshot-3',
            page_number: 2,
            crop_coordinates: { x: 0, y: 0, width: 100, height: 100, zoom_level: 1 },
            screenshot_url: 's3://bucket/screenshot-3.jpg',
            thumbnail_url: 's3://bucket/screenshot-3-thumb.jpg',
            caption: 'Page 2 again',
            screenshot_type: 'plan' as const,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        pdf_scale: 2.0,
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 2, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.allScreenshots).toHaveLength(3);
    expect(result.current.state.screenshots).toHaveLength(2); // Only page 2
    expect(result.current.state.screenshots.every(s => s.page_number === 2)).toBe(true);
  });

  it('should not fetch when disabled', async () => {
    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 1, false));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.state.measurements).toEqual([]);
    expect(result.current.state.calibration).toBeNull();
  });

  it('should not fetch without assessmentId', async () => {
    const { result } = renderHook(() => useAssessmentData(undefined, 'project-1', 1, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should include projectId and pageNumber in URL', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: { measurements: null, calibration: null, screenshots: null, pdf_scale: null },
      }),
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 3, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/assessments/assessment-1'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('projectId=project-1'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('pageNumber=3'),
      expect.any(Object)
    );
  });

  it('should provide refresh action', async () => {
    const mockResponse = {
      success: true,
      data: {
        measurements: [],
        calibration: null,
        screenshots: [],
        pdf_scale: 2.0,
      },
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 1, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Call refresh
    await result.current.actions.refresh();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should handle null data gracefully', async () => {
    const mockResponse = {
      success: true,
      data: {
        measurements: null,
        calibration: null,
        screenshots: null,
        pdf_scale: null,
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 1, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.measurements).toEqual([]);
    expect(result.current.state.calibration).toBeNull();
    expect(result.current.state.screenshots).toEqual([]);
    expect(result.current.state.allScreenshots).toEqual([]);
    expect(result.current.state.pdf_scale).toBe(2.0); // Defaults to 2.0
  });

  it('should handle fetch errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Server error' }),
    });

    const { result } = renderHook(() => useAssessmentData('assessment-1', 'project-1', 1, true));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.error).toBe('Server error');
    expect(result.current.state.measurements).toEqual([]);
  });
});

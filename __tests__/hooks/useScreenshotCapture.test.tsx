import { renderHook, waitFor } from '@testing-library/react';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { vi } from 'vitest';
import * as canvasUtils from '@/lib/pdf/canvas-utils';
import * as screenshotUpload from '@/lib/pdf/screenshot-upload';

// Mock dependencies
vi.mock('@/lib/pdf/canvas-utils');
vi.mock('@/lib/pdf/screenshot-upload');
vi.mock('@/lib/pdf/element-instance');

global.fetch = vi.fn();

describe('useScreenshotCapture', () => {
  const mockPage = {};
  const mockCanvas = document.createElement('canvas');
  const mockOcConfig = {};
  const mockRefreshScreenshots = vi.fn();
  const mockRefetchChecks = vi.fn();

  const mockBlob = new Blob(['test'], { type: 'image/png' });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock canvas capture
    vi.mocked(canvasUtils.captureCanvasRegion).mockResolvedValue({
      full: mockBlob,
      thumbnail: mockBlob,
    });

    // Mock screenshot upload
    vi.mocked(screenshotUpload.uploadScreenshot).mockResolvedValue({
      screenshotUrl: 's3://bucket/screenshot.png',
      thumbnailUrl: 's3://bucket/thumb.png',
    });

    // Mock screenshot save API
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'screenshot-123' }),
    });
  });

  describe('Plan screenshots (requires projectId)', () => {
    it('should successfully capture with projectId and checkId', async () => {
      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          assessmentId: 'assessment-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
          refetchChecks: mockRefetchChecks,
        })
      );

      await result.current.capture({
        target: 'current',
        type: 'plan',
        selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
        pageNumber: 1,
        zoomLevel: 1.0,
      });

      await waitFor(() => {
        expect(screenshotUpload.uploadScreenshot).toHaveBeenCalledWith(
          mockBlob,
          mockBlob,
          'project-123', // projectId
          'check-123', // checkId
          'assessment-123', // assessmentId
          'plan' // type
        );
      });

      expect(mockRefreshScreenshots).toHaveBeenCalled();
    });

    it('should fail without projectId for plan screenshots', async () => {
      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: undefined, // No projectId
          assessmentId: 'assessment-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      // Mock presign API to return error
      vi.mocked(screenshotUpload.uploadScreenshot).mockRejectedValueOnce(
        new Error('projectId and checkId required for plan screenshots')
      );

      await expect(
        result.current.capture({
          target: 'current',
          type: 'plan',
          selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
          pageNumber: 1,
          zoomLevel: 1.0,
        })
      ).rejects.toThrow('projectId and checkId required for plan screenshots');
    });

    it('should fail without checkId for plan screenshots', async () => {
      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          assessmentId: 'assessment-123',
          activeCheck: undefined, // No active check
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      await expect(
        result.current.capture({
          target: 'current',
          type: 'plan',
          selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
          pageNumber: 1,
          zoomLevel: 1.0,
        })
      ).rejects.toThrow('No check selected');
    });
  });

  describe('Elevation screenshots (requires assessmentId)', () => {
    it('should successfully capture with assessmentId only', async () => {
      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: undefined, // Not needed for elevations
          assessmentId: 'assessment-123',
          activeCheck: undefined, // Not needed for elevations
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      await result.current.capture({
        target: 'current',
        type: 'elevation',
        selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
        elementGroupId: 'doors-group-id',
        pageNumber: 2,
        zoomLevel: 1.5,
      });

      await waitFor(() => {
        expect(screenshotUpload.uploadScreenshot).toHaveBeenCalledWith(
          mockBlob,
          mockBlob,
          undefined, // projectId not needed
          undefined, // checkId not needed
          'assessment-123', // assessmentId
          'elevation' // type
        );
      });

      expect(mockRefreshScreenshots).toHaveBeenCalled();
    });
  });

  describe('Capture deduplication', () => {
    it('should skip if already capturing', async () => {
      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      // Start first capture (slow)
      vi.mocked(canvasUtils.captureCanvasRegion).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ full: mockBlob, thumbnail: mockBlob }), 100)
          )
      );

      const capture1 = result.current.capture({
        target: 'current',
        type: 'plan',
        selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
        pageNumber: 1,
        zoomLevel: 1.0,
      });

      // Attempt second capture immediately (should be skipped)
      const capture2 = result.current.capture({
        target: 'current',
        type: 'plan',
        selection: { startX: 50, startY: 50, endX: 150, endY: 150 },
        pageNumber: 1,
        zoomLevel: 1.0,
      });

      await Promise.all([capture1, capture2]);

      // Should only have called canvas capture once
      expect(canvasUtils.captureCanvasRegion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should handle canvas capture errors', async () => {
      vi.mocked(canvasUtils.captureCanvasRegion).mockRejectedValueOnce(
        new Error('Canvas rendering failed')
      );

      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      await expect(
        result.current.capture({
          target: 'current',
          type: 'plan',
          selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
          pageNumber: 1,
          zoomLevel: 1.0,
        })
      ).rejects.toThrow('Canvas rendering failed');
    });

    it('should handle upload errors', async () => {
      vi.mocked(screenshotUpload.uploadScreenshot).mockRejectedValueOnce(
        new Error('S3 upload failed')
      );

      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      await expect(
        result.current.capture({
          target: 'current',
          type: 'plan',
          selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
          pageNumber: 1,
          zoomLevel: 1.0,
        })
      ).rejects.toThrow('S3 upload failed');
    });

    it('should handle metadata save errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() =>
        useScreenshotCapture({
          page: mockPage,
          canvas: mockCanvas,
          ocConfig: mockOcConfig,
          renderScale: 4,
          projectId: 'project-123',
          activeCheck: { id: 'check-123' },
          refreshScreenshots: mockRefreshScreenshots,
        })
      );

      await expect(
        result.current.capture({
          target: 'current',
          type: 'plan',
          selection: { startX: 0, startY: 0, endX: 100, endY: 100 },
          pageNumber: 1,
          zoomLevel: 1.0,
        })
      ).rejects.toThrow('Failed to save screenshot');
    });
  });
});

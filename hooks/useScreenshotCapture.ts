import { useCallback, useRef } from 'react';
import { captureCanvasRegion } from '@/lib/pdf/canvas-utils';
import { createElementInstance } from '@/lib/pdf/element-instance';
import { uploadScreenshot } from '@/lib/pdf/screenshot-upload';

export interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type CaptureTarget = 'current' | 'bathroom' | 'door' | 'kitchen';
export type ScreenshotType = 'plan' | 'elevation';

interface CaptureOptions {
  target: CaptureTarget;
  type: ScreenshotType;
  selection: Selection;
  elementGroupId?: string;
  caption?: string;
  pageNumber: number;
  zoomLevel: number;
}

interface ScreenshotCaptureParams {
  page: any;
  canvas: HTMLCanvasElement | null;
  ocConfig: any;
  renderScale: number;
  assessmentId?: string;
  activeCheck?: any;
  onCheckAdded?: (check: any) => void;
  onCheckSelect?: (id: string) => void;
  onScreenshotSaved?: (checkId: string) => void;
  refreshScreenshots: () => void;
  refetchChecks?: () => Promise<void>;
}

/**
 * Hook for capturing screenshots from PDF canvas.
 *
 * Orchestrates the full screenshot workflow:
 * 1. Create element instance (if needed)
 * 2. Render high-res region from PDF
 * 3. Upload to S3
 * 4. Save metadata to database
 * 5. Extract text (for elevations)
 * 6. Trigger refresh
 *
 * @example
 * ```typescript
 * const { capture, capturing } = useScreenshotCapture({
 *   page,
 *   canvas: canvasRef.current,
 *   ocConfig,
 *   renderScale: 4,
 *   assessmentId,
 *   activeCheck,
 *   onScreenshotSaved: (id) => console.log('Saved:', id),
 *   refreshScreenshots
 * });
 *
 * // Capture selection to current check
 * await capture({
 *   target: 'current',
 *   type: 'plan',
 *   selection: { startX: 100, startY: 200, endX: 300, endY: 400 },
 *   pageNumber: 1,
 *   zoomLevel: 1.5
 * });
 * ```
 */
export function useScreenshotCapture(params: ScreenshotCaptureParams) {
  const {
    page,
    canvas,
    ocConfig,
    renderScale,
    assessmentId,
    activeCheck,
    onCheckAdded,
    onCheckSelect,
    onScreenshotSaved,
    refreshScreenshots,
    refetchChecks,
  } = params;

  const capturingRef = useRef(false);

  const capture = useCallback(
    async (options: CaptureOptions) => {
      const { target, type, selection, elementGroupId, caption, pageNumber, zoomLevel } = options;

      if (!page || !canvas) {
        throw new Error('Page or canvas not ready');
      }

      if (capturingRef.current) {
        console.warn('[useScreenshotCapture] Already capturing, skipping');
        return;
      }

      capturingRef.current = true;

      try {
        // Step 1: Determine target check ID
        let targetCheckId = activeCheck?.id;

        if (target !== 'current') {
          const newCheck = await createElementInstance(target, assessmentId);
          if (!newCheck) {
            throw new Error(`Failed to create ${target} instance`);
          }
          targetCheckId = newCheck.id;
          // Refetch ALL checks to get the full set (create-element creates 206 checks)
          await refetchChecks?.();
          onCheckAdded?.(newCheck);
          onCheckSelect?.(newCheck.id);
        }

        if (!targetCheckId && type === 'plan') {
          throw new Error('No check selected');
        }

        // Step 2: Normalize selection bounds
        const sx = Math.min(selection.startX, selection.endX);
        const sy = Math.min(selection.startY, selection.endY);
        const sw = Math.abs(selection.endX - selection.startX);
        const sh = Math.abs(selection.endY - selection.startY);

        // Step 3: Capture high-res region from canvas
        const { full, thumbnail } = await captureCanvasRegion(
          page,
          canvas,
          { x: sx, y: sy, width: sw, height: sh },
          renderScale,
          ocConfig
        );

        // Step 4: Upload to S3
        const { screenshotUrl, thumbnailUrl } = await uploadScreenshot(
          full,
          thumbnail,
          activeCheck?.project_id || assessmentId,
          targetCheckId
        );

        // Step 5: Extract text for elevations (if needed)
        const extractedText = '';
        if (type === 'elevation' && page) {
          // Text extraction would be done here if available
          // For now, we'll leave it empty
          // extractedText = await extractTextFromRegion(page, { x: sx, y: sy, width: sw, height: sh });
        }

        // Step 6: Save metadata
        await fetch('/api/screenshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            check_id: type === 'plan' ? targetCheckId : null,
            page_number: pageNumber,
            crop_coordinates: {
              x: sx,
              y: sy,
              width: sw,
              height: sh,
              zoom_level: zoomLevel,
            },
            screenshot_url: screenshotUrl,
            thumbnail_url: thumbnailUrl,
            caption: caption || '',
            screenshot_type: type,
            element_group_id: elementGroupId || null,
            extracted_text: extractedText || null,
          }),
        });

        // Step 7: Notify and refresh
        onScreenshotSaved?.(targetCheckId!);
        refreshScreenshots();
      } finally {
        capturingRef.current = false;
      }
    },
    [
      page,
      canvas,
      ocConfig,
      renderScale,
      assessmentId,
      activeCheck,
      onCheckAdded,
      onCheckSelect,
      onScreenshotSaved,
      refreshScreenshots,
    ]
  );

  return {
    capture,
    capturing: capturingRef.current,
  };
}

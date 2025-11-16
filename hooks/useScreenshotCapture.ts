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

export type CaptureTarget = 'current' | 'bathroom' | 'door' | 'kitchen' | 'wall';
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
  projectId?: string;
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
    projectId,
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
          const result = await createElementInstance(target, assessmentId);
          if (!result) {
            throw new Error(`Failed to create ${target} instance`);
          }
          console.log(
            `[useScreenshotCapture] Created ${target} instance "${result.instance.label}" (${result.checks_created} checks)`
          );

          // Use the first check ID for screenshot assignment
          targetCheckId = result.first_check_id;

          // Refetch ALL checks to get the newly created checks
          await refetchChecks?.();

          // Select the first check in the new instance
          onCheckSelect?.(result.first_check_id);
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
        console.log('[useScreenshotCapture] Uploading screenshot:', {
          type,
          projectId,
          checkId: targetCheckId,
          assessmentId,
        });

        const { screenshotUrl, thumbnailUrl } = await uploadScreenshot(
          full,
          thumbnail,
          projectId, // projectId (for plan screenshots)
          targetCheckId, // checkId (for plan screenshots)
          assessmentId, // assessmentId (for elevation screenshots)
          type // screenshotType
        );

        // Step 5: Extract text for elevations (if needed)
        const extractedText = '';
        if (type === 'elevation' && page) {
          // Text extraction would be done here if available
          // For now, we'll leave it empty
          // extractedText = await extractTextFromRegion(page, { x: sx, y: sy, width: sw, height: sh });
        }

        // Step 6: Save metadata
        const saveResponse = await fetch('/api/screenshots', {
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

        if (!saveResponse.ok) {
          throw new Error('Failed to save screenshot');
        }

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
      projectId,
      assessmentId,
      activeCheck,
      onCheckAdded,
      onCheckSelect,
      onScreenshotSaved,
      refreshScreenshots,
      refetchChecks,
    ]
  );

  return {
    capture,
    capturing: capturingRef.current,
  };
}

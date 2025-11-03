import { useRef } from 'react';
import { extractTextFromRegion } from '@/lib/pdf-text-extraction';

type Target = 'current' | 'bathroom' | 'door' | 'kitchen';
type ScreenshotType = 'plan' | 'elevation';

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CaptureDeps {
  page: any;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ocConfig: any;
  renderScale: number;
  getSafeRenderMultiplier: (baseViewport: any, desiredMultiplier: number) => number;
  assessmentId?: string;
  activeCheck?: any;
  onCheckAdded?: (check: any) => void;
  onCheckSelect?: (checkId: string) => void;
  onScreenshotSaved?: (checkId: string) => void;
  refreshScreenshots: () => void;
}

/**
 * Provides a capture() function to crop a selected region from the PDF canvas,
 * render at high resolution, upload screenshot + thumbnail, and persist the record.
 */
export function useScreenshotCapture({
  page,
  canvasRef,
  ocConfig,
  renderScale,
  getSafeRenderMultiplier,
  assessmentId,
  activeCheck,
  onCheckAdded,
  onCheckSelect,
  onScreenshotSaved,
  refreshScreenshots,
}: CaptureDeps) {
  const capturingRef = useRef(false);

  // Create a new element instance for certain targets
  const createElementInstance = async (
    elementSlug: 'bathroom' | 'door' | 'kitchen'
  ): Promise<any | null> => {
    const elementGroupSlugs: Record<string, string> = {
      bathroom: 'bathrooms',
      door: 'doors',
      kitchen: 'kitchens',
    };
    const slug = elementGroupSlugs[elementSlug];
    if (!slug || !assessmentId) return null;
    try {
      const res = await fetch(`/api/checks/create-element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, elementGroupSlug: slug }),
      });
      if (!res.ok) return null;
      const { check } = await res.json();
      return check;
    } catch {
      return null;
    }
  };

  const capture = async (
    selection: Selection | null,
    pageNumber: number,
    zoomLevel: number,
    target: Target = 'current',
    screenshotType: ScreenshotType = 'plan',
    elementGroupId?: string,
    caption?: string
  ) => {
    try {
      if (!selection || !page) return;
      if (capturingRef.current) return;
      capturingRef.current = true;

      let targetCheckId = activeCheck?.id;
      if (target !== 'current') {
        const newCheck = await createElementInstance(target);
        if (!newCheck) {
          alert(`Failed to create new ${target} instance.`);
          return;
        }
        targetCheckId = newCheck.id;
        onCheckAdded?.(newCheck);
        onCheckSelect?.(newCheck.id);
      }
      if (!targetCheckId) {
        alert('No check selected. Please select a check first.');
        return;
      }

      const canvas = canvasRef.current!;
      // cssToCanvas is the safeMultiplier (canvas backing store pixels per CSS pixel)
      const baseViewportForCalc = page.getViewport({ scale: 1 });
      const cssToCanvas = canvas.width / Math.ceil(baseViewportForCalc.width);
      const sx = Math.min(selection.startX, selection.endX);
      const sy = Math.min(selection.startY, selection.endY);
      const sw = Math.abs(selection.endX - selection.startX);
      const sh = Math.abs(selection.endY - selection.startY);

      const canvasSx = Math.floor(sx * cssToCanvas);
      const canvasSy = Math.floor(sy * cssToCanvas);
      const canvasSw = Math.max(1, Math.ceil(sw * cssToCanvas));
      const canvasSh = Math.max(1, Math.ceil(sh * cssToCanvas));

      // High-res offscreen render with the same ocConfig and multiplier
      const baseViewport = page.getViewport({ scale: 1 });
      const desiredMultiplier = renderScale;
      const safeMultiplier = getSafeRenderMultiplier(baseViewport, desiredMultiplier);
      const viewport = page.getViewport({ scale: safeMultiplier });
      const off = document.createElement('canvas');
      off.width = Math.ceil(viewport.width);
      off.height = Math.ceil(viewport.height);
      const octx = off.getContext('2d')!;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.fillStyle = 'white';
      octx.fillRect(0, 0, off.width, off.height);

      const screenshotRenderParams = {
        canvasContext: octx,
        viewport: viewport,
        ...(ocConfig && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
      };

      await page.render(screenshotRenderParams).promise;

      // Map selection from on-screen canvas pixels to offscreen pixels
      const renderToDisplayedRatio = viewport.width / canvas.width;
      const rx = Math.max(0, Math.floor(canvasSx * renderToDisplayedRatio));
      const ry = Math.max(0, Math.floor(canvasSy * renderToDisplayedRatio));
      const rw = Math.max(1, Math.ceil(canvasSw * renderToDisplayedRatio));
      const rh = Math.max(1, Math.ceil(canvasSh * renderToDisplayedRatio));

      const cx = Math.min(rx, off.width - 1);
      const cy = Math.min(ry, off.height - 1);
      const cw = Math.min(rw, off.width - cx);
      const ch = Math.min(rh, off.height - cy);

      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d')!.drawImage(off, cx, cy, cw, ch, 0, 0, cw, ch);

      // Thumbnail
      const thumbMax = 240;
      const r = Math.min(1, thumbMax / Math.max(cw, ch));
      const tw = Math.max(1, Math.round(cw * r));
      const th = Math.max(1, Math.round(ch * r));
      const t = document.createElement('canvas');
      t.width = tw;
      t.height = th;
      t.getContext('2d')!.drawImage(out, 0, 0, tw, th);

      // Use maximum quality PNG (quality param doesn't apply to PNG, but it's lossless by default)
      const [blob, thumb] = await Promise.all([
        new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
        new Promise<Blob>(resolve => t.toBlob(b => resolve(b!), 'image/png')),
      ]);

      const res = await fetch('/api/screenshots/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeCheck?.project_id || assessmentId,
          checkId: targetCheckId,
        }),
      });
      if (!res.ok) throw new Error('Failed to get presigned URLs');
      const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();

      await Promise.all([
        fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob }),
        fetch(thumbUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: thumb,
        }),
      ]);

      // Extract text from PDF region for elevations
      let extractedText = '';
      if (screenshotType === 'elevation' && page) {
        extractedText = await extractTextFromRegion(page, {
          x: sx,
          y: sy,
          width: sw,
          height: sh,
        });
      }

      await fetch('/api/screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_id: screenshotType === 'plan' ? targetCheckId : null, // Only assign to check for plan screenshots
          page_number: pageNumber,
          crop_coordinates: {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
            zoom_level: zoomLevel,
          },
          screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${key}`,
          thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${thumbKey}`,
          caption: caption || '',
          screenshot_type: screenshotType,
          element_group_id: elementGroupId || null,
          extracted_text: extractedText || null,
        }),
      });

      onScreenshotSaved?.(targetCheckId);
      refreshScreenshots();
    } catch (err) {
      alert('Failed to save screenshot.');
      console.error('[useScreenshotCapture] capture failed:', err);
    } finally {
      capturingRef.current = false;
    }
  };

  return { capture };
}
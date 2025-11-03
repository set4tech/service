import { useCallback, useRef } from 'react';
import type { PDFLayer } from './usePdfLayers';

const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 268_000_000; // 16384^2

/**
 * Provides page rendering utilities for a PDF.js page onto a canvas.
 * Returns a renderPage() callback and a helper getSafeRenderMultiplier().
 */
export function usePdfRender(
  page: any,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  ocConfig: any,
  layers: PDFLayer[],
  disableLayers: boolean,
  renderScale: number
) {
  const renderTaskRef = useRef<any>(null);

  const getSafeRenderMultiplier = useCallback((baseViewport: any, desiredMultiplier: number) => {
    const maxBySide = Math.min(
      MAX_CANVAS_SIDE / baseViewport.width,
      MAX_CANVAS_SIDE / baseViewport.height
    );
    const maxByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height));
    const cap = Math.min(maxBySide, maxByPixels);
    return Math.max(1, Math.min(desiredMultiplier, cap));
  }, []);

  const renderPage = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || !page) {
      return;
    }

    // Validate page object has required methods
    if (typeof page.getViewport !== 'function' || typeof page.render !== 'function') {
      console.error('[usePdfRender] Invalid page object');
      return;
    }

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    // Calculate safe multiplier for rendering quality
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport) {
      console.error('[usePdfRender] Failed to get base viewport from page');
      return;
    }

    const desiredMultiplier = renderScale;
    const safeMultiplier = getSafeRenderMultiplier(baseViewport, desiredMultiplier);

    // Create viewport at safe scale for PDF.js rendering
    const viewport = page.getViewport({ scale: safeMultiplier });
    if (!viewport) {
      console.error('[usePdfRender] Failed to get viewport at scale', safeMultiplier);
      return;
    }

    // CSS size at 1x (base PDF dimensions), canvas at safeMultiplier for quality
    const widthCSS = Math.ceil(baseViewport.width);
    const heightCSS = Math.ceil(baseViewport.height);
    c.style.width = `${widthCSS}px`;
    c.style.height = `${heightCSS}px`;
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);

    const ctx = c.getContext('2d');
    if (!ctx) return;

    // White background to avoid transparency over gray app background
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();

    // No transform needed - viewport scale already matches canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Ensure ocConfig reflects our current layer state
    if (ocConfig && layers.length > 0) {
      for (const layer of layers) {
        try {
          ocConfig.setVisibility?.(layer.id, layer.visible);
        } catch (err) {
          console.error('[usePdfRender] Error setting layer visibility:', err);
        }
      }
    }

    // Validate render parameters
    if (!viewport || !viewport.width || !viewport.height) {
      console.error('[usePdfRender] Invalid viewport');
      return;
    }

    const renderParams = {
      canvasContext: ctx,
      viewport: viewport,
      ...(ocConfig && !disableLayers && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
    };

    const task = page.render(renderParams);
    renderTaskRef.current = task;

    try {
      await task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[usePdfRender] Render error:', err);
      }
    } finally {
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    }
  }, [page, renderScale, ocConfig, layers, disableLayers, canvasRef, getSafeRenderMultiplier]);

  return { renderPage, getSafeRenderMultiplier };
}
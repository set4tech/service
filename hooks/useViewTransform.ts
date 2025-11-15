import { useCallback, useMemo, RefObject } from 'react';
import type { Transform } from '@/hooks/usePdfPersistence';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

interface ViewTransformActions {
  zoom: (direction: 'in' | 'out', pivot?: { x: number; y: number }) => void;
  reset: () => void;
  centerOn: (bounds: { x: number; y: number; width: number; height: number }) => void;
  attachWheelZoom: () => () => void;
}

/**
 * Hook for managing view transform (pan/zoom) on a PDF canvas.
 *
 * Features:
 * - Zoom in/out with optional pivot point
 * - Wheel-based zoom centered at cursor
 * - Reset zoom
 * - Center view on specific bounds
 *
 * @example
 * ```typescript
 * const transform = useViewTransform(
 *   viewportRef,
 *   persistence.state.transform,
 *   persistence.actions.setTransform
 * );
 *
 * // Zoom centered at viewport center
 * transform.zoom('in');
 *
 * // Center on violation bounds
 * transform.centerOn({ x: 100, y: 200, width: 50, height: 50 });
 *
 * // Attach wheel zoom listener
 * useEffect(() => transform.attachWheelZoom(), []);
 * ```
 */
export function useViewTransform(
  containerRef: RefObject<HTMLElement>,
  transform: Transform,
  setTransform: (t: Transform) => void
): ViewTransformActions {
  const zoom = useCallback(
    (direction: 'in' | 'out', pivot?: { x: number; y: number }) => {
      const factor = direction === 'in' ? 1.2 : 1 / 1.2;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale * factor));

      const container = containerRef.current;
      if (!container || !pivot) {
        // No pivot or container, just change scale
        setTransform({ ...transform, scale: nextScale });
        return;
      }

      // Zoom with pivot point
      const rect = container.getBoundingClientRect();
      const sx = pivot.x - rect.left;
      const sy = pivot.y - rect.top;

      // Point in content coordinates
      const cx = (sx - transform.tx) / transform.scale;
      const cy = (sy - transform.ty) / transform.scale;

      // New transform to keep point under cursor
      setTransform({
        tx: sx - cx * nextScale,
        ty: sy - cy * nextScale,
        scale: nextScale,
      });
    },
    [containerRef, transform, setTransform]
  );

  const reset = useCallback(() => {
    setTransform({ tx: 0, ty: 0, scale: 1 });
  }, [setTransform]);

  const centerOn = useCallback(
    (bounds: { x: number; y: number; width: number; height: number } | null | undefined) => {
      const el = containerRef.current;
      if (!el || !bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height))
        return;
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      setTransform({
        ...transform,
        tx: el.clientWidth / 2 - cx * transform.scale,
        ty: el.clientHeight / 2 - cy * transform.scale,
      });
    },
    [containerRef, transform, setTransform]
  );

  const attachWheelZoom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return () => {};

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const prevScale = transform.scale;
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, prevScale * (1 - e.deltaY * 0.003))
      );

      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Point in content coordinates
      const cx = (sx - transform.tx) / prevScale;
      const cy = (sy - transform.ty) / prevScale;

      setTransform({
        tx: sx - cx * nextScale,
        ty: sy - cy * nextScale,
        scale: nextScale,
      });
    };

    el.addEventListener('wheel', onWheel as EventListener, { passive: false });

    // Prevent pinch-to-zoom gestures
    const cancelGesture = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', cancelGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', cancelGesture as EventListener, { passive: false });
    el.addEventListener('gestureend', cancelGesture as EventListener, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel as EventListener);
      el.removeEventListener('gesturestart', cancelGesture as EventListener);
      el.removeEventListener('gesturechange', cancelGesture as EventListener);
      el.removeEventListener('gestureend', cancelGesture as EventListener);
    };
  }, [containerRef, transform, setTransform]);

  return useMemo(
    () => ({ zoom, reset, centerOn, attachWheelZoom }),
    [zoom, reset, centerOn, attachWheelZoom]
  );
}

/**
 * Convert screen coordinates to content coordinates.
 *
 * @param transform - Current view transform
 * @param containerEl - Container element for coordinate calculation
 * @param clientX - Mouse/touch X coordinate
 * @param clientY - Mouse/touch Y coordinate
 * @returns Content coordinates
 */
export function screenToContent(
  transform: Transform,
  containerEl: HTMLElement | null,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  if (!containerEl) return { x: 0, y: 0 };

  const rect = containerEl.getBoundingClientRect();
  const x = (clientX - rect.left - transform.tx) / transform.scale;
  const y = (clientY - rect.top - transform.ty) / transform.scale;

  return { x, y };
}

import type { Transform } from '@/hooks/usePdfPersistence';

/**
 * Calculate zoom factor from wheel delta.
 * Uses logarithmic scaling for smooth zooming.
 */
export function calculateZoomFactor(wheelDelta: number): number {
  return 1 - wheelDelta * 0.003;
}

/**
 * Clamp scale value to reasonable bounds.
 */
export function clampScale(scale: number, min: number = 0.1, max: number = 10): number {
  return Math.max(min, Math.min(max, scale));
}

/**
 * Calculate transform to zoom at a specific pivot point.
 * 
 * @param currentTransform - Current transform state
 * @param pivotScreen - Pivot point in screen coordinates (relative to container)
 * @param newScale - Target scale
 * @returns New transform with adjusted translation
 */
export function zoomAtPoint(
  currentTransform: Transform,
  pivotScreen: { x: number; y: number },
  newScale: number
): Transform {
  // Point in content coordinates (before zoom)
  const contentX = (pivotScreen.x - currentTransform.tx) / currentTransform.scale;
  const contentY = (pivotScreen.y - currentTransform.ty) / currentTransform.scale;

  // After zoom, we want the same content point to be under the cursor
  // screen = content * scale + tx
  // tx = screen - content * scale
  return {
    tx: pivotScreen.x - contentX * newScale,
    ty: pivotScreen.y - contentY * newScale,
    scale: newScale,
  };
}

/**
 * Calculate transform to center specific bounds in container.
 * 
 * @param containerSize - Container dimensions
 * @param bounds - Content bounds to center
 * @param currentScale - Current scale (preserved)
 * @returns Transform that centers the bounds
 */
export function centerBounds(
  containerSize: { width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number },
  currentScale: number
): Transform {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  const viewportCenterX = containerSize.width / 2;
  const viewportCenterY = containerSize.height / 2;

  return {
    tx: viewportCenterX - centerX * currentScale,
    ty: viewportCenterY - centerY * currentScale,
    scale: currentScale,
  };
}

/**
 * Calculate transform to fit content in container.
 * 
 * @param containerSize - Container dimensions
 * @param contentSize - Content dimensions
 * @param padding - Optional padding in pixels
 * @returns Transform that fits content
 */
export function fitContent(
  containerSize: { width: number; height: number },
  contentSize: { width: number; height: number },
  padding: number = 20
): Transform {
  const availableWidth = containerSize.width - padding * 2;
  const availableHeight = containerSize.height - padding * 2;

  const scaleX = availableWidth / contentSize.width;
  const scaleY = availableHeight / contentSize.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in, only fit

  const scaledWidth = contentSize.width * scale;
  const scaledHeight = contentSize.height * scale;

  return {
    tx: (containerSize.width - scaledWidth) / 2,
    ty: (containerSize.height - scaledHeight) / 2,
    scale,
  };
}

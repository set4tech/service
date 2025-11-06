'use client';

import { memo } from 'react';
import { BoundingBox } from './BoundingBox';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenshotIndicatorOverlayProps {
  bounds: Bounds;
}

/**
 * Simple overlay component showing previously captured screenshot areas.
 * Renders a faint blue rectangle with no interaction to help users avoid
 * re-screenshotting the same areas.
 */
export const ScreenshotIndicatorOverlay = memo(function ScreenshotIndicatorOverlay({
  bounds,
}: ScreenshotIndicatorOverlayProps) {
  return (
    <BoundingBox
      bounds={bounds}
      borderColor="rgba(59, 130, 246, 0.3)"
      backgroundColor="rgba(59, 130, 246, 0.05)"
      borderStyle="solid"
      borderWidth={1}
    />
  );
});



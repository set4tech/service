'use client';

import { memo, ReactNode } from 'react';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoundingBoxProps {
  bounds: Bounds;
  borderColor: string;
  backgroundColor: string;
  borderStyle?: 'solid' | 'dashed';
  borderWidth?: number;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Reusable base component for rendering positioned rectangular overlays on PDFs.
 * Used by both ViolationBoundingBox and ScreenshotIndicatorOverlay.
 */
export const BoundingBox = memo(function BoundingBox({
  bounds,
  borderColor,
  backgroundColor,
  borderStyle = 'solid',
  borderWidth = 2,
  onClick,
  children,
  className = '',
}: BoundingBoxProps) {
  if (!bounds.width || !bounds.height) {
    return null;
  }

  return (
    <div
      className={`absolute ${onClick ? 'pointer-events-auto' : 'pointer-events-none'} ${className}`}
      style={{
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? 'Bounding box' : undefined}
    >
      {/* Border and background */}
      <div
        className="absolute inset-0 rounded"
        style={{
          border: `${borderWidth}px ${borderStyle} ${borderColor}`,
          backgroundColor,
        }}
      />

      {children}
    </div>
  );
});


'use client';

import { memo, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';

interface Props {
  violations: ViolationMarkerType[];
  onClick: (marker: ViolationMarkerType) => void;
  isVisible: boolean;
  isHighlighted?: boolean;
  fanOutIndex?: number;
  totalInGroup?: number;
}

export const ViolationBoundingBox = memo(function ViolationBoundingBox({
  violations,
  onClick,
  isVisible,
  isHighlighted = false,
  fanOutIndex = 0,
  totalInGroup: _totalInGroup = 1,
}: Props) {
  const [hover, setHover] = useState(false);

  if (!isVisible || violations.length === 0) {
    return null;
  }

  // Use the first violation's bounds to position the bounding box
  const primaryViolation = violations[0];
  const bounds = primaryViolation.bounds;

  if (!bounds.width || !bounds.height) {
    return null;
  }

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'major':
        return {
          dot: 'bg-danger-600',
          border: 'rgba(185, 28, 28, 0.6)',
          borderHover: 'rgba(185, 28, 28, 0.9)',
          bg: 'rgba(185, 28, 28, 0.1)',
        };
      case 'moderate':
        return {
          dot: 'bg-yellow-600',
          border: 'rgba(217, 119, 6, 0.6)',
          borderHover: 'rgba(217, 119, 6, 0.9)',
          bg: 'rgba(217, 119, 6, 0.1)',
        };
      case 'minor':
        return {
          dot: 'bg-accent-600',
          border: 'rgba(15, 118, 110, 0.6)',
          borderHover: 'rgba(15, 118, 110, 0.9)',
          bg: 'rgba(15, 118, 110, 0.1)',
        };
      default:
        return {
          dot: 'bg-gray-600',
          border: 'rgba(75, 85, 99, 0.6)',
          borderHover: 'rgba(75, 85, 99, 0.9)',
          bg: 'rgba(75, 85, 99, 0.1)',
        };
    }
  };

  const colors = getSeverityColors(primaryViolation.severity);

  // Calculate offset for fanned out violations
  const offset = fanOutIndex * 3;

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${bounds.x + offset}px`,
        top: `${bounds.y + offset}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={() => onClick(primaryViolation)}
      role="button"
      aria-label={`Violation group: ${violations.length} violation(s)`}
    >
      {/* Bounding box border */}
      <div
        className="absolute inset-0 rounded transition-all"
        style={{
          border: `2px ${isHighlighted ? 'solid' : 'dashed'} ${hover || isHighlighted ? colors.borderHover : colors.border}`,
          backgroundColor: hover || isHighlighted ? colors.bg : 'transparent',
          transform: hover ? 'scale(1.02)' : 'scale(1)',
        }}
      />

      {/* Corner marker dot */}
      <div
        className="absolute -top-1 -left-1"
        style={{
          transform: hover ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 120ms cubic-bezier(0.2,0,0,1)',
        }}
      >
        <span
          className={`block rounded-full border-2 border-white shadow-md ${colors.dot}`}
          style={{
            width: 12,
            height: 12,
          }}
        />
      </div>

      {/* Badge showing count if multiple violations */}
      {violations.length > 1 && (
        <div
          className="absolute -top-2 -right-2 rounded-full bg-white border-2 shadow-md px-1.5 py-0.5 min-w-[20px] flex items-center justify-center"
          style={{
            borderColor: colors.border,
          }}
        >
          <span className="text-[10px] font-bold text-ink-700">{violations.length}</span>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div className="absolute z-10 translate-x-3 -translate-y-2 select-none pointer-events-auto">
          <div className="rounded border border-line bg-white/95 shadow-md p-2 min-w-[220px] max-w-[280px]">
            <div className="text-xs font-medium font-mono text-ink-700">
              {primaryViolation.codeSectionNumber}
            </div>
            <div className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">
              {primaryViolation.description}
            </div>
            {violations.length > 1 && (
              <div className="text-[10px] text-ink-400 mt-1">
                +{violations.length - 1} more violation(s) in this area
              </div>
            )}
            {primaryViolation.sourceUrl && (
              <a
                href={primaryViolation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-600 underline hover:text-accent-500"
                onClick={e => e.stopPropagation()}
              >
                {primaryViolation.sourceLabel || primaryViolation.codeSectionNumber}
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14 3h7v7M21 3l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path d="M21 14v7H3V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

'use client';

import { memo, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';

interface Props {
  marker: ViolationMarkerType;
  onClick: (marker: ViolationMarkerType) => void;
  isVisible: boolean;
}

export const ViolationMarker = memo(function ViolationMarker({
  marker,
  onClick,
  isVisible,
}: Props) {
  const [hover, setHover] = useState(false);

  if (!isVisible || !marker.bounds.width || !marker.bounds.height) {
    return null;
  }

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'major':
        return {
          dot: 'bg-danger-600',
          ring: 'rgba(185, 28, 28, 0.45)',
          ringHover: 'var(--tw-color-danger-500)',
        };
      case 'moderate':
        return {
          dot: 'bg-yellow-600',
          ring: 'rgba(217, 119, 6, 0.45)',
          ringHover: 'rgb(234, 179, 8)',
        };
      case 'minor':
        return {
          dot: 'bg-accent-600',
          ring: 'rgba(15, 118, 110, 0.45)',
          ringHover: 'var(--tw-color-accent-500)',
        };
      default:
        return {
          dot: 'bg-gray-600',
          ring: 'rgba(75, 85, 99, 0.45)',
          ringHover: 'rgb(107, 114, 128)',
        };
    }
  };

  const colors = getSeverityColors(marker.severity);

  return (
    <div
      className="absolute"
      style={{
        left: `${marker.bounds.x}px`,
        top: `${marker.bounds.y}px`,
        width: `${marker.bounds.width}px`,
        height: `${marker.bounds.height}px`,
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={() => onClick(marker)}
      role="button"
      aria-label={`Violation: ${marker.description}`}
    >
      {/* Precise marker dot */}
      <span
        className="block rounded-full border"
        style={{
          width: 10,
          height: 10,
          borderWidth: 'var(--hairline)',
          borderColor: hover ? colors.ringHover : colors.ring,
          boxShadow: '0 0 0 2px rgba(0,0,0,.06)',
          transition: 'transform 120ms cubic-bezier(0.2,0,0,1), box-shadow 120ms',
          transform: hover ? 'scale(1.08)' : 'scale(1)',
          background: hover ? colors.ringHover : 'white',
        }}
      >
        <span className={`block w-full h-full rounded-full ${colors.dot}`} />
      </span>

      {/* Hover tooltip with source link */}
      {hover && (
        <div className="absolute z-10 translate-x-3 -translate-y-2 select-none pointer-events-auto">
          <div className="rounded border border-line bg-white/95 shadow-md p-2 min-w-[220px]">
            <div className="text-xs font-medium font-mono text-ink-700">
              {marker.codeSectionNumber}
            </div>
            <div className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{marker.description}</div>
            {marker.sourceUrl && (
              <a
                href={marker.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-600 underline hover:text-accent-500"
                onClick={e => e.stopPropagation()}
              >
                {marker.sourceLabel || marker.codeSectionNumber}
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

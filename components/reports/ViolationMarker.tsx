'use client';

import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import clsx from 'clsx';

interface Props {
  marker: ViolationMarkerType;
  onClick: (marker: ViolationMarkerType) => void;
  isVisible: boolean;
}

export function ViolationMarker({ marker, onClick, isVisible }: Props) {
  if (!isVisible || !marker.bounds.width || !marker.bounds.height) {
    return null;
  }

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'major':
        return {
          border: 'border-red-500',
          bg: 'bg-red-500/20',
          pin: 'bg-red-500',
          text: 'text-white',
        };
      case 'moderate':
        return {
          border: 'border-yellow-500',
          bg: 'bg-yellow-500/20',
          pin: 'bg-yellow-500',
          text: 'text-white',
        };
      case 'minor':
        return {
          border: 'border-blue-500',
          bg: 'bg-blue-500/20',
          pin: 'bg-blue-500',
          text: 'text-white',
        };
      default:
        return {
          border: 'border-gray-500',
          bg: 'bg-gray-500/20',
          pin: 'bg-gray-500',
          text: 'text-white',
        };
    }
  };

  const colors = getSeverityColors(marker.severity);

  return (
    <button
      onClick={() => onClick(marker)}
      className={clsx(
        'absolute border-2 transition-all cursor-pointer group',
        colors.border,
        colors.bg,
        'hover:border-4'
      )}
      style={{
        left: `${marker.bounds.x}px`,
        top: `${marker.bounds.y}px`,
        width: `${marker.bounds.width}px`,
        height: `${marker.bounds.height}px`,
        pointerEvents: 'auto',
      }}
      aria-label={`Violation: ${marker.description}`}
    >
      {/* Pin/Badge in top-right corner */}
      <div
        className={clsx(
          'absolute -top-3 -right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110',
          colors.pin,
          colors.text
        )}
      >
        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" className="drop-shadow">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
      </div>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
        <div className="font-semibold">{marker.codeSectionNumber}</div>
        <div className="text-gray-300 capitalize">{marker.severity} violation</div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
          <div className="border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </button>
  );
}

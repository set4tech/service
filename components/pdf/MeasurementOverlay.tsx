'use client';

import React from 'react';

export interface Measurement {
  id: string;
  project_id: string;
  page_number: number;
  start_point: { x: number; y: number };
  end_point: { x: number; y: number };
  pixels_distance: number;
  real_distance_inches: number | null;
  label?: string | null;
  color?: string;
  created_at?: string;
}

interface MeasurementOverlayProps {
  measurements: Measurement[];
  selectedMeasurementId: string | null; // Legacy - kept for backward compatibility
  selectedMeasurementIds?: string[]; // New multi-select support
  onMeasurementClick?: (measurementId: string, ctrlKey?: boolean, shiftKey?: boolean) => void;
  zoom: number;
  translateX: number;
  translateY: number;
  calibrationLine?: {
    start_point: { x: number; y: number };
    end_point: { x: number; y: number };
  } | null;
}

export function MeasurementOverlay({
  measurements,
  selectedMeasurementId,
  selectedMeasurementIds = [],
  onMeasurementClick,
  zoom,
  translateX,
  translateY,
  calibrationLine,
}: MeasurementOverlayProps) {
  // Convert PDF coordinates to screen coordinates
  // Note: PDF coordinates are already in the rotated space (handled by PDF.js)
  const toScreen = (pdfX: number, pdfY: number) => ({
    x: pdfX * zoom + translateX,
    y: pdfY * zoom + translateY,
  });

  const formatDistance = (measurement: Measurement): string => {
    if (
      measurement.real_distance_inches !== null &&
      measurement.real_distance_inches !== undefined
    ) {
      const inches = measurement.real_distance_inches;
      const feet = Math.floor(inches / 12);
      const remainingInches = Math.round(inches % 12);

      if (feet > 0) {
        return remainingInches > 0 ? `${feet}' ${remainingInches}"` : `${feet}'`;
      }
      return `${remainingInches}"`;
    }
    return `${Math.round(measurement.pixels_distance)}px`;
  };

  const handleMeasurementClick = (e: React.MouseEvent, measurementId: string) => {
    e.stopPropagation();
    onMeasurementClick?.(measurementId, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  // Generate unique marker IDs for each measurement to support different colors
  const getMarkerIds = (measurementId: string, color: string, isSelected: boolean) => {
    const cleanColor = color.replace('#', '');
    const suffix = isSelected ? 'selected' : 'normal';
    return {
      start: `arrowhead-start-${measurementId}-${cleanColor}-${suffix}`,
      end: `arrowhead-end-${measurementId}-${cleanColor}-${suffix}`,
    };
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Calibration line (shown in gold/yellow) */}
      {calibrationLine &&
        (() => {
          const start = toScreen(calibrationLine.start_point.x, calibrationLine.start_point.y);
          const end = toScreen(calibrationLine.end_point.x, calibrationLine.end_point.y);

          return (
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 35,
              }}
            >
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#F59E0B"
                strokeWidth="3"
                strokeDasharray="8,4"
                opacity={1}
              />
              {/* Start point circle */}
              <circle
                cx={start.x}
                cy={start.y}
                r="6"
                fill="#F59E0B"
                stroke="white"
                strokeWidth="2"
                opacity={1}
              />
              {/* End point circle */}
              <circle
                cx={end.x}
                cy={end.y}
                r="6"
                fill="#F59E0B"
                stroke="white"
                strokeWidth="2"
                opacity={1}
              />
            </svg>
          );
        })()}

      {/* Measurements */}
      {measurements.map(measurement => {
        // Check both legacy single select and new multi-select
        const isSelected =
          measurement.id === selectedMeasurementId ||
          selectedMeasurementIds.includes(measurement.id);
        const color = measurement.color || '#3B82F6';

        // Convert coordinates
        const start = toScreen(measurement.start_point.x, measurement.start_point.y);
        const end = toScreen(measurement.end_point.x, measurement.end_point.y);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        const markerIds = getMarkerIds(measurement.id, color, isSelected);

        // Fixed sizes (no scaling needed) - made more visible
        const arrowSize = isSelected ? 10 : 8;
        const strokeWidth = isSelected ? 4 : 3;

        return (
          <React.Fragment key={measurement.id}>
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 30,
              }}
            >
              {/* Define arrow markers */}
              <defs>
                {/* Start arrow (pointing away from start point) */}
                <marker
                  id={markerIds.start}
                  markerWidth={arrowSize}
                  markerHeight={arrowSize}
                  refX={0}
                  refY={arrowSize / 2}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d={`M 0 ${arrowSize / 2} L ${arrowSize} 0 L ${arrowSize} ${arrowSize} Z`}
                    fill={color}
                    stroke="white"
                    strokeWidth="0.5"
                  />
                </marker>
                {/* End arrow (pointing away from end point) */}
                <marker
                  id={markerIds.end}
                  markerWidth={arrowSize}
                  markerHeight={arrowSize}
                  refX={arrowSize}
                  refY={arrowSize / 2}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${arrowSize} ${arrowSize / 2} L 0 0 L 0 ${arrowSize} Z`}
                    fill={color}
                    stroke="white"
                    strokeWidth="0.5"
                  />
                </marker>
              </defs>

              {/* Measurement line with arrow markers */}
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={color}
                strokeWidth={strokeWidth}
                opacity={1}
                markerStart={`url(#${markerIds.start})`}
                markerEnd={`url(#${markerIds.end})`}
                className="transition-all"
                strokeLinecap="round"
              />
            </svg>

            {/* Label with distance */}
            <div
              onClick={e => handleMeasurementClick(e, measurement.id)}
              style={{
                position: 'absolute',
                left: `${midX}px`,
                top: `${midY - 20}px`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: 31,
              }}
              className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap shadow-md transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white border-2 border-blue-700'
                  : 'bg-white text-gray-900 border border-gray-300 hover:border-blue-400 hover:shadow-lg'
              }`}
            >
              {formatDistance(measurement)}
              {measurement.label && (
                <div className="text-[10px] opacity-80 truncate max-w-[100px]">
                  {measurement.label}
                </div>
              )}
              {isSelected && selectedMeasurementIds.length <= 1 && (
                <div className="text-[9px] mt-0.5 opacity-90">
                  Delete to remove • Ctrl+Click for multi-select
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

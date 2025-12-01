'use client';

import React from 'react';

interface PDFModeBannerProps {
  modeType: 'idle' | 'screenshot' | 'measure' | 'calibrate';
  isDrawingCalibrationLine: boolean;
  hasSelection: boolean;
  scaleNotation?: string | null;
  selectedMeasurementCount: number;
  hasMeasurements: boolean;
  readOnly: boolean;
}

export function PDFModeBanner({
  modeType,
  isDrawingCalibrationLine,
  hasSelection,
  scaleNotation,
  selectedMeasurementCount,
  hasMeasurements,
  readOnly,
}: PDFModeBannerProps) {
  // Screenshot mode banner
  if (modeType === 'screenshot') {
    return (
      <>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📸 Screenshot Mode: Click and drag to select area
          </div>
        </div>

        {/* Screenshot shortcut hints - only shown when there's a selection */}
        {hasSelection && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex gap-2 pointer-events-none">
            <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-blue-500 font-mono">
              C - Save to Current (exits)
            </kbd>
            <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-green-500 font-mono">
              E - Save as Elevation (stays active)
            </kbd>
            <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
              B - Bathroom
            </kbd>
            <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
              D - Door
            </kbd>
            <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
              K - Kitchen
            </kbd>
          </div>
        )}
      </>
    );
  }

  // Measurement mode banner
  if (modeType === 'measure') {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="bg-green-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
          📏 Measurement Mode: Draw lines to measure
          {scaleNotation ? (
            <span className="ml-2 opacity-90 font-mono">({scaleNotation})</span>
          ) : (
            <span className="ml-2 opacity-90">(No scale set - press L)</span>
          )}
          <span className="ml-3 opacity-90 text-xs">Click line to select • Delete to remove</span>
        </div>
      </div>
    );
  }

  // Calibration line drawing mode
  if (isDrawingCalibrationLine) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="bg-purple-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
          📐 Calibration Mode: Draw a line along a known distance
          <span className="ml-3 opacity-90 text-xs">Press Esc to cancel</span>
        </div>
      </div>
    );
  }

  // Measurement selection banner (when in idle mode but have selected measurements)
  if (selectedMeasurementCount > 0 && hasMeasurements && !readOnly) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
          {selectedMeasurementCount === 1 ? (
            <>
              Measurement selected • Press{' '}
              <kbd className="px-1.5 py-0.5 bg-blue-700 rounded mx-1 font-mono text-xs">Delete</kbd>{' '}
              to remove
              <span className="ml-3 opacity-90 text-xs">Ctrl+Click for multi-select</span>
            </>
          ) : (
            <>
              {selectedMeasurementCount} measurements selected • Press{' '}
              <kbd className="px-1.5 py-0.5 bg-blue-700 rounded mx-1 font-mono text-xs">Delete</kbd>{' '}
              to remove all
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

'use client';

import React, { useState, useEffect } from 'react';

type CalibrationMethod = 'page-size' | 'known-length';

interface CalibrationModalProps {
  currentScale?: string;
  currentPrintSize?: { width: number; height: number };
  pdfDimensions?: { width: number; height: number }; // in PDF points
  storedPdfDimensions?: { widthInches: number; heightInches: number } | null; // Stored dimensions from database
  projectId?: string; // For on-demand dimension detection
  onSave: (scaleNotation: string, printWidth: number, printHeight: number) => void;
  onSaveKnownLength: (
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    knownDistanceInches: number
  ) => void;
  onCancel: () => void;
  onRequestLineDraw?: () => void; // Called when user wants to draw a calibration line
  calibrationLine?: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
}

export function CalibrationModal({
  currentScale,
  currentPrintSize,
  pdfDimensions,
  storedPdfDimensions,
  projectId,
  onSave,
  onSaveKnownLength,
  onCancel,
  onRequestLineDraw,
  calibrationLine,
}: CalibrationModalProps) {
  const [method, setMethod] = useState<CalibrationMethod>('page-size');
  const [scaleNotation, setScaleNotation] = useState(currentScale || '');
  const [printSize, setPrintSize] = useState<string>(
    currentPrintSize ? `${currentPrintSize.width}x${currentPrintSize.height}` : '24x36'
  );
  const [knownDistance, setKnownDistance] = useState<string>('');
  const [knownDistanceUnit, setKnownDistanceUnit] = useState<'feet' | 'inches'>('feet');
  const [detectingDimensions, setDetectingDimensions] = useState(false);
  const [detectedDimensions, setDetectedDimensions] = useState<{
    widthInches: number;
    heightInches: number;
  } | null>(storedPdfDimensions || null);

  // Calculate PDF size in inches for reference (72 PDF points = 1 inch)
  const pdfInches = pdfDimensions
    ? {
        width: (pdfDimensions.width / 72).toFixed(1),
        height: (pdfDimensions.height / 72).toFixed(1),
      }
    : null;

  const parsePrintSize = () => {
    const match = printSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)$/i);
    if (!match) return null;
    return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
  };

  const isValidScale = (): boolean => {
    if (!scaleNotation.trim()) return false;
    // Match patterns like: 1/8"=1'-0", 1/4"=1', 1"=10', 3/16"=1'-0"
    const match = scaleNotation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
    return match !== null;
  };

  const isValidPrintSize = (): boolean => {
    const parsed = parsePrintSize();
    if (!parsed) return false;

    // Validate dimensions are reasonable (1" to 100" range)
    if (parsed.width < 1 || parsed.width > 100 || parsed.height < 1 || parsed.height > 100) {
      return false;
    }

    // Validate aspect ratio roughly matches PDF if we have dimensions
    // Check both orientations (landscape and portrait)
    if (pdfDimensions && pdfInches) {
      const pdfAspect = pdfDimensions.width / pdfDimensions.height;
      const printAspect = parsed.width / parsed.height;
      const diff = Math.abs(pdfAspect - printAspect) / pdfAspect;

      // Also check flipped orientation (24x36 vs 36x24)
      const flippedPrintAspect = parsed.height / parsed.width;
      const flippedDiff = Math.abs(pdfAspect - flippedPrintAspect) / pdfAspect;

      // Allow 15% tolerance for aspect ratio mismatch (more lenient)
      // Pass if either orientation matches
      if (diff > 0.15 && flippedDiff > 0.15) {
        return false;
      }
    }
    return true;
  };

  const isValidKnownLength = (): boolean => {
    if (!calibrationLine) return false;
    const distance = parseFloat(knownDistance);
    if (isNaN(distance) || distance <= 0) return false;
    return true;
  };

  const handleSave = () => {
    if (method === 'page-size') {
      if (isValidScale() && isValidPrintSize()) {
        const size = parsePrintSize()!;

        // Auto-correct orientation to match PDF if needed
        // If PDF is landscape but user entered portrait (or vice versa), swap dimensions
        let finalWidth = size.width;
        let finalHeight = size.height;

        if (pdfDimensions) {
          const pdfIsLandscape = pdfDimensions.width > pdfDimensions.height;
          const printIsLandscape = size.width > size.height;

          // If orientations don't match, swap the print dimensions
          if (pdfIsLandscape !== printIsLandscape) {
            finalWidth = size.height;
            finalHeight = size.width;
          }
        }

        onSave(scaleNotation.trim(), finalWidth, finalHeight);
      }
    } else if (method === 'known-length') {
      if (isValidKnownLength() && calibrationLine) {
        let distanceInches = parseFloat(knownDistance);
        if (knownDistanceUnit === 'feet') {
          distanceInches *= 12; // Convert feet to inches
        }
        onSaveKnownLength(calibrationLine.start, calibrationLine.end, distanceInches);
      }
    }
  };

  const canSave = (): boolean => {
    if (method === 'page-size') {
      return isValidScale() && isValidPrintSize();
    } else {
      return isValidKnownLength();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSave()) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleDetectDimensions = async () => {
    if (!projectId || detectingDimensions) return;

    setDetectingDimensions(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/dimensions`);
      if (!response.ok) throw new Error('Failed to detect dimensions');

      const data = await response.json();
      if (data.dimensions) {
        setDetectedDimensions(data.dimensions);
        // Auto-fill the print size
        const width = Math.round(data.dimensions.widthInches);
        const height = Math.round(data.dimensions.heightInches);
        setPrintSize(`${width}x${height}`);
      }
    } catch (error) {
      console.error('Error detecting dimensions:', error);
      alert('Failed to detect PDF dimensions. Please enter manually.');
    } finally {
      setDetectingDimensions(false);
    }
  };

  const calculateLineLength = (): string | null => {
    if (!calibrationLine) return null;
    const dx = calibrationLine.end.x - calibrationLine.start.x;
    const dy = calibrationLine.end.y - calibrationLine.start.y;
    const lengthPx = Math.sqrt(dx * dx + dy * dy);
    return lengthPx.toFixed(1);
  };

  // Common architectural sheet sizes
  const commonSizes = [
    { label: 'Letter (8.5×11)', value: '8.5x11' },
    { label: 'Tabloid (11×17)', value: '11x17' },
    { label: 'ANSI C (17×22)', value: '17x22' },
    { label: 'ANSI D (24×36)', value: '24x36' },
    { label: 'ANSI E (36×48)', value: '36x48' },
    { label: 'Arch D (24×36)', value: '24x36' },
    { label: 'Arch E (36×48)', value: '36x48' },
  ];

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      document.getElementById('scale-input')?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-semibold mb-4">Calibrate Measurements</h2>

        {/* Method Selector */}
        <div className="mb-6">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMethod('page-size')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                method === 'page-size'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Page Size Method
            </button>
            <button
              type="button"
              onClick={() => setMethod('known-length')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                method === 'known-length'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Known Length Method
            </button>
          </div>
        </div>

        {method === 'page-size' && pdfInches && (
          <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-medium">PDF dimensions:</span> {pdfInches.width}″ ×{' '}
              {pdfInches.height}″
            </p>
            <p className="text-xs text-gray-500 mt-1">
              (Internal PDF coordinate space at 72 points/inch)
            </p>
          </div>
        )}

        {method === 'page-size' && (
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-gray-700">
              Enter the architectural scale and intended print size for accurate measurements.
            </p>
          </div>
        )}

        {method === 'known-length' && (
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-gray-700">
              Draw a line between two points of known distance on the plan, then enter the
              real-world measurement.
            </p>
          </div>
        )}

        {/* Page Size Method Fields */}
        {method === 'page-size' && (
          <>
            <div className="mb-4">
              <label htmlFor="scale-input" className="block text-sm font-medium text-gray-700 mb-2">
                Architectural Scale
              </label>
              <input
                id="scale-input"
                type="text"
                value={scaleNotation}
                onChange={e => setScaleNotation(e.target.value)}
                placeholder='e.g., 1/8"=1&apos;-0"'
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-base"
              />
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <div className="font-medium">Common scales:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setScaleNotation('1/8"=1\'-0"')}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono"
                  >
                    1/8&quot;=1&apos;-0&quot;
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleNotation('1/4"=1\'-0"')}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono"
                  >
                    1/4&quot;=1&apos;-0&quot;
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleNotation('1/2"=1\'-0"')}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono"
                  >
                    1/2&quot;=1&apos;-0&quot;
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleNotation('1"=1\'-0"')}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono"
                  >
                    1&quot;=1&apos;-0&quot;
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label
                htmlFor="print-size-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Intended Print Size (inches)
              </label>
              <input
                id="print-size-input"
                type="text"
                value={printSize}
                onChange={e => setPrintSize(e.target.value)}
                placeholder="24x36"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
              {projectId && (
                <button
                  type="button"
                  onClick={
                    detectedDimensions
                      ? () => {
                          const width = Math.round(detectedDimensions.widthInches);
                          const height = Math.round(detectedDimensions.heightInches);
                          setPrintSize(`${width}x${height}`);
                        }
                      : handleDetectDimensions
                  }
                  disabled={detectingDimensions}
                  className="mt-2 w-full px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {detectingDimensions ? (
                    <>🔍 Detecting PDF size...</>
                  ) : detectedDimensions ? (
                    <>
                      📄 Use detected PDF size ({Math.round(detectedDimensions.widthInches)}×
                      {Math.round(detectedDimensions.heightInches)}″)
                    </>
                  ) : (
                    <>🔍 Detect PDF Size</>
                  )}
                </button>
              )}
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                <div className="font-medium">Common sheet sizes:</div>
                <div className="flex flex-wrap gap-1">
                  {commonSizes.map(size => (
                    <button
                      key={`${size.label}-${size.value}`}
                      type="button"
                      onClick={() => setPrintSize(size.value)}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>
              {printSize && !isValidPrintSize() && parsePrintSize() && pdfInches && (
                <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>
                    Aspect ratio doesn&apos;t match PDF dimensions ({pdfInches.width}″ ×{' '}
                    {pdfInches.height}″). Try swapping width/height or double-check the intended
                    print size.
                  </span>
                </p>
              )}
            </div>

            {/* Preview for Page Size */}
            {isValidScale() && isValidPrintSize() && (
              <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
                <p className="text-sm text-gray-700">
                  ✓ Scale: <strong className="font-mono">{scaleNotation}</strong>
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  ✓ Print size: <strong>{printSize}″ sheet</strong>
                  {(() => {
                    const size = parsePrintSize();
                    if (!size || !pdfDimensions) return null;
                    const pdfIsLandscape = pdfDimensions.width > pdfDimensions.height;
                    const printIsLandscape = size.width > size.height;
                    if (pdfIsLandscape !== printIsLandscape) {
                      return (
                        <span className="ml-2 text-xs text-blue-600">
                          (will use {size.height}×{size.width} to match PDF orientation)
                        </span>
                      );
                    }
                    return null;
                  })()}
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  All measurements will calculate real distances using this configuration.
                </p>
              </div>
            )}
          </>
        )}

        {/* Known Length Method Fields */}
        {method === 'known-length' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Step 1: Draw Calibration Line
              </label>
              <button
                type="button"
                onClick={() => {
                  if (onRequestLineDraw) {
                    onRequestLineDraw();
                  }
                }}
                disabled={!onRequestLineDraw}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                {calibrationLine
                  ? '✓ Line Drawn - Click to Redraw'
                  : '📏 Click to Draw Line on PDF'}
              </button>
              {calibrationLine && (
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200 text-xs">
                  <p className="text-green-700">✓ Line drawn: {calculateLineLength()} pixels</p>
                  <p className="text-gray-600 mt-1">
                    From ({calibrationLine.start.x.toFixed(1)}, {calibrationLine.start.y.toFixed(1)}
                    ) to ({calibrationLine.end.x.toFixed(1)}, {calibrationLine.end.y.toFixed(1)})
                  </p>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label
                htmlFor="known-distance-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Step 2: Enter Known Distance
              </label>
              <div className="flex gap-2">
                <input
                  id="known-distance-input"
                  type="text"
                  value={knownDistance}
                  onChange={e => setKnownDistance(e.target.value)}
                  placeholder="10"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                />
                <select
                  value={knownDistanceUnit}
                  onChange={e => setKnownDistanceUnit(e.target.value as 'feet' | 'inches')}
                  className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="feet">feet</option>
                  <option value="inches">inches</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter the real-world distance that the line represents (e.g., if you drew along a
                dimension line that says &quot;10&apos;-0&quot;&quot;, enter 10 feet)
              </p>
            </div>

            {/* Preview for Known Length */}
            {isValidKnownLength() && (
              <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
                <p className="text-sm text-gray-700">
                  ✓ Calibration line: <strong>{calculateLineLength()} pixels</strong>
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  ✓ Known distance:{' '}
                  <strong>
                    {knownDistance} {knownDistanceUnit}
                  </strong>
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  All measurements will be calculated based on this calibration line.
                </p>
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {method === 'page-size' ? 'Set Scale & Size' : 'Save Calibration'}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Press{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">
            Enter
          </kbd>{' '}
          to save or{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Esc</kbd>{' '}
          to cancel
        </p>
      </div>
    </div>
  );
}

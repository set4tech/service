'use client';

import React from 'react';

interface PDFToolbarProps {
  // Zoom controls
  zoomPct: number;
  onZoomIn: () => void;
  onZoomOut: () => void;

  // Render scale (detail)
  renderScale: number;
  onRenderScaleChange: (scale: number) => void;
  savingScale: boolean;

  // Layers
  layerCount: number;
  showLayerPanel: boolean;
  onToggleLayerPanel: () => void;

  // Mode controls (only shown when not readOnly)
  readOnly: boolean;
  showScreenshotIndicators: boolean;
  onToggleScreenshotIndicators: () => void;

  // Screenshot mode
  isScreenshotMode: boolean;
  onToggleScreenshotMode: () => void;
  hasSelection: boolean;
  onSaveToCurrent: () => void;

  // Measurement mode
  isMeasureMode: boolean;
  onToggleMeasureMode: () => void;

  // Calibration
  onOpenCalibration: () => void;
}

export function PDFToolbar({
  zoomPct,
  onZoomIn,
  onZoomOut,
  renderScale,
  onRenderScaleChange,
  savingScale,
  layerCount,
  showLayerPanel,
  onToggleLayerPanel,
  readOnly,
  showScreenshotIndicators,
  onToggleScreenshotIndicators,
  isScreenshotMode,
  onToggleScreenshotMode,
  hasSelection,
  onSaveToCurrent,
  isMeasureMode,
  onToggleMeasureMode,
  onOpenCalibration,
}: PDFToolbarProps) {
  return (
    <div className="absolute top-3 right-3 z-50 flex items-center gap-2 pointer-events-auto">
      {/* Zoom controls */}
      <button aria-label="Zoom out" className="btn-icon bg-white shadow-md" onClick={onZoomOut}>
        −
      </button>
      <div className="px-2 py-2 text-sm bg-white border rounded shadow-md">{zoomPct}%</div>
      <button aria-label="Zoom in" className="btn-icon bg-white shadow-md" onClick={onZoomIn}>
        +
      </button>

      {/* Detail/render scale controls */}
      <div className="flex items-center gap-1 bg-white border rounded shadow-md px-2 py-1">
        <span className="text-xs text-gray-600 whitespace-nowrap">Detail:</span>
        <button
          aria-label="Decrease resolution"
          className="btn-icon bg-white text-xs px-1.5 py-0.5"
          onClick={() => onRenderScaleChange(Math.max(2, renderScale - 0.5))}
          disabled={savingScale || renderScale <= 2}
        >
          −
        </button>
        <span className="text-xs font-medium w-8 text-center">{renderScale.toFixed(1)}x</span>
        <button
          aria-label="Increase resolution"
          className="btn-icon bg-white text-xs px-1.5 py-0.5"
          onClick={() => onRenderScaleChange(Math.min(8, renderScale + 0.5))}
          disabled={savingScale || renderScale >= 8}
        >
          +
        </button>
      </div>

      {/* Layer toggle (only shown if layers exist) */}
      {layerCount > 0 && (
        <button
          aria-pressed={showLayerPanel}
          aria-label="Toggle layers panel"
          className={`btn-icon shadow-md ${showLayerPanel ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={onToggleLayerPanel}
          title="Layers"
        >
          ☰
        </button>
      )}

      {/* Edit mode controls */}
      {!readOnly && (
        <>
          <button
            aria-pressed={showScreenshotIndicators}
            aria-label="Toggle captured area indicators"
            title="Show/hide previously captured areas"
            className={`btn-icon shadow-md ${showScreenshotIndicators ? 'bg-blue-600 text-white' : 'bg-white'}`}
            onClick={onToggleScreenshotIndicators}
          >
            📦
          </button>
          <button
            aria-pressed={isScreenshotMode}
            aria-label="Toggle screenshot mode (S)"
            title="Capture a portion of the plan"
            className={`btn-icon shadow-md ${isScreenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
            onClick={onToggleScreenshotMode}
          >
            📸
          </button>
          {isScreenshotMode && hasSelection && (
            <button className="btn-secondary shadow-md" onClick={onSaveToCurrent}>
              Save to Current
            </button>
          )}
          <button
            aria-pressed={isMeasureMode}
            aria-label="Toggle measurement mode (M)"
            title="Measure distances on the plan"
            className={`btn-icon shadow-md ${isMeasureMode ? 'bg-green-600 text-white' : 'bg-white'}`}
            onClick={onToggleMeasureMode}
          >
            📏
          </button>
          <button
            aria-label="Set drawing scale (L)"
            title="Set drawing scale"
            className="btn-icon shadow-md bg-white"
            onClick={onOpenCalibration}
          >
            🔧
          </button>
        </>
      )}
    </div>
  );
}

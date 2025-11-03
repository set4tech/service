'use client';

import React, { useState, useEffect } from 'react';

interface CalibrationModalProps {
  currentScale?: string;
  onSave: (scaleNotation: string) => void;
  onCancel: () => void;
}

export function CalibrationModal({ currentScale, onSave, onCancel }: CalibrationModalProps) {
  const [scaleNotation, setScaleNotation] = useState(currentScale || '');

  const isValidScale = (): boolean => {
    if (!scaleNotation.trim()) return false;
    // Match patterns like: 1/8"=1'-0", 1/4"=1', 1"=10', 3/16"=1'-0"
    const match = scaleNotation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
    return match !== null;
  };

  const handleSave = () => {
    if (isValidScale()) {
      onSave(scaleNotation.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidScale()) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

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
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-semibold mb-4">Set Drawing Scale</h2>

        <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
          <p className="text-sm text-gray-700">
            Enter the architectural scale from the drawing title block.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            All measurements will automatically use this scale.
          </p>
        </div>

        {/* Input field */}
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

        {/* Preview */}
        {isValidScale() && (
          <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-gray-700">
              ✓ Valid scale: <strong className="font-mono">{scaleNotation}</strong>
            </p>
            <p className="text-xs text-gray-600 mt-2">
              All measurement lines you draw will automatically calculate real distances using this
              scale.
            </p>
          </div>
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
            disabled={!isValidScale()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Set Scale
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

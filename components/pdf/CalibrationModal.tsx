'use client';

import { useEffect, useRef, useState } from 'react';

interface CalibrationModalProps {
  currentScale?: string | null;
  onSave: (scaleNotation: string) => void;
  onCancel: () => void;
}

/**
 * Simple modal to set the drawing scale, e.g. 1" = 10'
 * Matches the expectations of PDFViewer which passes and consumes a single string.
 */
export function CalibrationModal({ currentScale, onSave, onCancel }: CalibrationModalProps) {
  const [scale, setScale] = useState<string>(currentScale || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus input when modal opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Enter/Escape globally while modal is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onSave(scale.trim());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scale, onCancel, onSave]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center" onClick={onCancel}>
      <div
        className="bg-white rounded-lg shadow-2xl p-5 w-[420px] max-w-[92vw]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Set drawing scale"
      >
        <h3 className="text-lg font-semibold mb-2">Set drawing scale</h3>
        <p className="text-sm text-gray-600 mb-4">
          Enter scale notation as shown on the drawing, for example{' '}
          <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">1&quot; = 10&apos;</span> or{' '}
          <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">3/8&quot; = 1&apos;-0&quot;</span>.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={scale}
          onChange={e => setScale(e.target.value)}
          placeholder={'e.g., 1" = 10\' or 3/8" = 1\'-0"'}
          className="w-full border rounded px-3 py-2 mb-3"
        />
        <div className="flex gap-2">
          <button
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => onSave(scale.trim())}
          >
            Save (Enter)
          </button>
          <button
            className="flex-1 border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
            onClick={onCancel}
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
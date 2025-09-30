'use client';

import { useState } from 'react';

interface CloneCheckModalProps {
  checkId: string;
  checkName: string;
  onClose: () => void;
  onSuccess: (newCheck: any) => void;
}

export function CloneCheckModal({ checkId, checkName, onClose, onSuccess }: CloneCheckModalProps) {
  const [instanceLabel, setInstanceLabel] = useState('');
  const [copyScreenshots, setCopyScreenshots] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async () => {
    if (!instanceLabel.trim()) {
      setError('Please enter a label for this instance');
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      const response = await fetch(`/api/checks/${checkId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceLabel: instanceLabel.trim(),
          copyScreenshots,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clone check');
      }

      onSuccess(data.check);
      onClose();
    } catch (err: any) {
      console.error('Clone error:', err);
      setError(err.message);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Create Check Instance</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <div className="text-sm text-gray-600 mb-3">
              <span className="font-medium">Check:</span> {checkName}
            </div>
            <p className="text-xs text-gray-500">
              Create a new instance to assess the same code section against a different element
              (e.g., another door, window, or area).
            </p>
          </div>

          <div>
            <label htmlFor="instanceLabel" className="block text-sm font-medium text-gray-700 mb-1">
              Instance Label <span className="text-red-500">*</span>
            </label>
            <input
              id="instanceLabel"
              type="text"
              value={instanceLabel}
              onChange={e => setInstanceLabel(e.target.value)}
              placeholder="e.g., Door 2 - North Entrance"
              disabled={isCloning}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Give this instance a descriptive name to distinguish it from others
            </p>
          </div>

          <div className="flex items-start">
            <input
              id="copyScreenshots"
              type="checkbox"
              checked={copyScreenshots}
              onChange={e => setCopyScreenshots(e.target.checked)}
              disabled={isCloning}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="copyScreenshots" className="ml-2 text-sm text-gray-700">
              Copy screenshots from original check
            </label>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isCloning}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={isCloning || !instanceLabel.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isCloning ? 'Creating...' : 'Create Instance'}
          </button>
        </div>
      </div>
    </div>
  );
}

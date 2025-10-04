'use client';

import { useState } from 'react';

interface SectionResult {
  section_key: string;
  section_number: string;
  compliance_status: string;
  confidence: string;
  reasoning: string;
  violations?: any[];
  recommendations?: string[];
}

interface TriageModalProps {
  sections: SectionResult[];
  onClose: () => void;
  onSave: (overrides: Record<string, { status: string; note: string }>) => Promise<void>;
}

export function TriageModal({ sections, onClose, onSave }: TriageModalProps) {
  const [overrides, setOverrides] = useState<Record<string, { status: string; note: string }>>({});
  const [saving, setSaving] = useState(false);

  const handleStatusChange = (sectionKey: string, status: string) => {
    setOverrides(prev => ({
      ...prev,
      [sectionKey]: {
        status,
        note: prev[sectionKey]?.note || '',
      },
    }));
  };

  const handleNoteChange = (sectionKey: string, note: string) => {
    setOverrides(prev => ({
      ...prev,
      [sectionKey]: {
        status: prev[sectionKey]?.status || '',
        note,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(overrides);
      onClose();
    } catch (error) {
      console.error('Failed to save overrides:', error);
    } finally {
      setSaving(false);
    }
  };

  const triageCount = Object.keys(overrides).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Review Sections - Needs More Info
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {sections.length} sections need your assessment
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {sections.map(section => {
              const override = overrides[section.section_key];
              const isTriaged = override && override.status;

              return (
                <div
                  key={section.section_key}
                  className={`border rounded-lg p-4 ${
                    isTriaged ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  {/* Section Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-mono font-semibold text-gray-900">
                        {section.section_number}
                      </h4>
                      <p className="text-sm text-gray-700 mt-1">{section.reasoning}</p>
                    </div>
                    {isTriaged && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                        Triaged
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => handleStatusChange(section.section_key, 'compliant')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded border transition-colors ${
                        override?.status === 'compliant'
                          ? 'bg-green-100 border-green-400 text-green-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      ✓ Compliant
                    </button>
                    <button
                      onClick={() => handleStatusChange(section.section_key, 'non_compliant')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded border transition-colors ${
                        override?.status === 'non_compliant'
                          ? 'bg-red-100 border-red-400 text-red-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      ✗ Non-Compliant
                    </button>
                    <button
                      onClick={() => handleStatusChange(section.section_key, 'not_applicable')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded border transition-colors ${
                        override?.status === 'not_applicable'
                          ? 'bg-gray-100 border-gray-400 text-gray-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      ⊘ Not Applicable
                    </button>
                  </div>

                  {/* Optional Note */}
                  {override?.status && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Note (optional)
                      </label>
                      <input
                        type="text"
                        value={override.note || ''}
                        onChange={e => handleNoteChange(section.section_key, e.target.value)}
                        placeholder="Add a note about your assessment..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-gray-600">
            {triageCount > 0 && (
              <span>
                {triageCount} of {sections.length} triaged
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || triageCount === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : `Save ${triageCount > 0 ? `(${triageCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

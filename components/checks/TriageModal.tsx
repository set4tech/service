'use client';

import { useState, useEffect } from 'react';
import type { SectionResult } from '@/types/analysis';

interface TriageModalProps {
  sections: SectionResult[];
  onClose: () => void;
  onSave: (overrides: Record<string, { status: string; note: string }>) => Promise<void>;
}

export function TriageModal({ sections, onClose, onSave }: TriageModalProps) {
  const [overrides, setOverrides] = useState<Record<string, { status: string; note: string }>>({});
  const [saving, setSaving] = useState(false);
  const [enrichedSections, setEnrichedSections] = useState<SectionResult[]>(sections);
  const [loading, setLoading] = useState(true);

  // Fetch section text and title for all sections
  useEffect(() => {
    const enrichSections = async () => {
      setLoading(true);
      try {
        // Collect unique section numbers (not full keys)
        const sectionKeys = sections.map(s => s.section_number).filter(Boolean);

        console.log(
          '[TriageModal] Section numbers to fetch:',
          JSON.stringify(sectionKeys, null, 2)
        );
        console.log(
          '[TriageModal] Full sections:',
          JSON.stringify(
            sections.map(s => ({
              section_key: s.section_key,
              section_number: s.section_number,
            })),
            null,
            2
          )
        );

        if (sectionKeys.length === 0) {
          setEnrichedSections(sections);
          setLoading(false);
          return;
        }

        // Fetch section data from database
        const response = await fetch('/api/sections/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: sectionKeys }),
        });

        if (!response.ok) {
          console.error('Failed to fetch section details');
          setEnrichedSections(sections);
          setLoading(false);
          return;
        }

        const sectionData: Array<{ key: string; number: string; text: string; title: string }> =
          await response.json();
        console.log('[TriageModal] Fetched section data:', sectionData);
        // Map by number for lookup
        const sectionMap = new Map(sectionData.map(s => [s.number, s]));

        // Enrich sections with text and title
        const enriched = sections.map(section => {
          const sectionInfo = sectionMap.get(section.section_number);
          return {
            ...section,
            section_text: sectionInfo?.text,
            section_title: sectionInfo?.title,
          };
        });

        setEnrichedSections(enriched);
      } catch (error) {
        console.error('Error enriching sections:', error);
        setEnrichedSections(sections);
      } finally {
        setLoading(false);
      }
    };

    enrichSections();
  }, [sections]);

  const handleStatusChange = (sectionKey: string, status: string) => {
    setOverrides(prev => ({
      ...prev,
      [sectionKey]: {
        status,
        note: prev[sectionKey]?.note || '',
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
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading section details...</div>
          ) : (
            <div className="space-y-4">
              {enrichedSections.map(section => {
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
                        <h4 className="text-base font-mono font-bold text-gray-900">
                          {section.section_number}
                        </h4>
                        {section.section_title && (
                          <p className="text-sm font-medium text-gray-700 mt-1">
                            {section.section_title}
                          </p>
                        )}
                        {section.section_text ? (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                              {section.section_text}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-800">No code text available</p>
                          </div>
                        )}
                        {section.reasoning && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                              AI Note
                            </summary>
                            <p className="text-xs text-gray-600 mt-1 ml-4">{section.reasoning}</p>
                          </details>
                        )}
                      </div>
                      {isTriaged && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium flex-shrink-0">
                          Triaged
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
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
                  </div>
                );
              })}
            </div>
          )}
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

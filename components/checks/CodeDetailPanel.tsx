'use client';

import { useEffect, useState } from 'react';

interface CodeSection {
  key: string;
  number: string;
  title: string;
  text?: string;
  requirements?: string[];
  references?: Array<{
    key: string;
    number: string;
    title: string;
    text?: string;
  }>;
}

interface CodeDetailPanelProps {
  sectionKey: string | null;
  onClose: () => void;
}

export function CodeDetailPanel({ sectionKey, onClose }: CodeDetailPanelProps) {
  const [section, setSection] = useState<CodeSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionKey) {
      setSection(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch('/api/compliance/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionKey }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch section details');
        return res.json();
      })
      .then(data => {
        setSection(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load section:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [sectionKey]);

  if (!sectionKey) return null;

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <h3 className="text-base font-semibold text-gray-900">Code Section Details</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close panel"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-sm text-gray-500">Loading section details...</div>}

        {error && (
          <div className="text-sm text-red-600">
            <p className="font-medium">Error loading section</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        )}

        {section && !loading && (
          <div className="space-y-6">
            {/* Section Header */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Section
              </div>
              <div className="text-lg font-bold text-gray-900">{section.number}</div>
              <div className="text-base text-gray-700 mt-1">{section.title}</div>
            </div>

            {/* Section Text */}
            {section.text && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Code Text
                </div>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                  {section.text}
                </div>
              </div>
            )}

            {/* Requirements */}
            {section.requirements && section.requirements.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Requirements
                </div>
                <ul className="space-y-2">
                  {section.requirements.map((req, idx) => (
                    <li key={idx} className="text-sm text-gray-800 leading-relaxed pl-4 relative">
                      <span className="absolute left-0 text-gray-400">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* References */}
            {section.references && section.references.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Referenced Sections
                </div>
                <div className="space-y-3">
                  {section.references.map(ref => (
                    <div key={ref.key} className="border border-gray-200 rounded p-3 bg-blue-50">
                      <div className="font-medium text-sm text-blue-900">{ref.number}</div>
                      <div className="text-sm text-gray-700 mt-1">{ref.title}</div>
                      {ref.text && (
                        <div className="text-xs text-gray-600 mt-2 line-clamp-3">{ref.text}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!section.text && (!section.requirements || section.requirements.length === 0) && (
              <div className="text-sm text-gray-500 italic">
                No detailed content available for this section.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

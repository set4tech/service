'use client';

import { useEffect, useState } from 'react';

interface CodeInfo {
  title: string;
  version: string;
  sourceUrl?: string;
}

interface AmendedSection {
  id: number;
  number: string;
  title: string;
  sourceUrl: string | null;
}

interface Amendment {
  id: number;
  key: string;
  number: string;
  title: string;
  text: string;
  sourceUrl: string | null;
  codeId: string;
  amendsSection: AmendedSection | null;
}

interface Props {
  assessmentId: string;
  codeInfo: CodeInfo | null;
}

export function CodeInformation({ assessmentId, codeInfo }: Props) {
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchAmendments() {
      try {
        setLoading(true);

        const response = await fetch(`/api/assessments/${assessmentId}/amendments`);
        if (!response.ok) {
          throw new Error('Failed to fetch amendments');
        }

        const data = await response.json();
        console.log('[CodeInformation] Fetched amendments:', data);

        setAmendments(data.amendments || []);
        setJurisdiction(data.jurisdiction || null);
      } catch (err) {
        console.error('[CodeInformation] Error fetching amendments:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAmendments();
  }, [assessmentId]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <h2 className="text-lg font-semibold text-ink-900 mb-4">Code Information</h2>

      {/* Base Code Information */}
      {codeInfo ? (
        <div className="space-y-4 mb-6">
          <div className="border-b border-line pb-4">
            <div className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-1">
              Code Name
            </div>
            <div className="text-sm text-ink-900 font-medium">{codeInfo.title}</div>
          </div>

          <div className="border-b border-line pb-4">
            <div className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-1">
              Version
            </div>
            <div className="text-sm text-ink-900">{codeInfo.version}</div>
          </div>

          {codeInfo.sourceUrl && (
            <div className="border-b border-line pb-4">
              <div className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-1">
                Code Website
              </div>
              <a
                href={codeInfo.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-600 hover:text-accent-700 underline flex items-center gap-1"
              >
                View Code Source
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-500 mb-6">No code information available</p>
      )}

      {/* Local Amendments Section */}
      <div className="border-t border-line pt-6">
        <h3 className="text-base font-semibold text-ink-900 mb-1">Local Amendments</h3>
        {jurisdiction && (
          <p className="text-xs text-ink-500 mb-4">{jurisdiction} specific code modifications</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-600"></div>
          </div>
        ) : !jurisdiction ? (
          <div className="bg-paper border border-line rounded-lg p-4 text-center">
            <p className="text-xs text-ink-500">
              No jurisdiction assigned.
              <br />
              Set a jurisdiction to view local amendments.
            </p>
          </div>
        ) : amendments.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg p-4 text-center">
            <p className="text-xs text-ink-500">No local amendments found for {jurisdiction}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {amendments.map(amendment => (
              <div
                key={amendment.id}
                className="border border-line rounded-lg bg-white overflow-hidden hover:shadow-sm transition-shadow"
              >
                <button
                  onClick={() => setExpandedId(expandedId === amendment.id ? null : amendment.id)}
                  className="w-full px-3 py-2.5 text-left hover:bg-paper transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-orange-600 font-medium mb-0.5">
                        {amendment.number}
                      </div>
                      <div className="text-sm text-ink-900 font-medium leading-tight line-clamp-2">
                        {amendment.title}
                      </div>
                      {amendment.amendsSection && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-ink-500">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                          </svg>
                          Amends {amendment.amendsSection.number}
                        </div>
                      )}
                    </div>
                    <svg
                      className={`w-4 h-4 text-ink-400 flex-shrink-0 transition-transform ${
                        expandedId === amendment.id ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {expandedId === amendment.id && (
                  <div className="px-3 pb-3 border-t border-line bg-paper">
                    <div className="pt-3">
                      {amendment.amendsSection && (
                        <div className="mb-3 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="text-xs text-orange-700 font-medium mb-1">
                            Base Code Section
                          </div>
                          <div className="text-sm text-ink-900">
                            {amendment.amendsSection.number} - {amendment.amendsSection.title}
                          </div>
                          {amendment.amendsSection.sourceUrl && (
                            <a
                              href={amendment.amendsSection.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-orange-600 hover:text-orange-700 underline flex items-center gap-1 mt-1"
                            >
                              View original section
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </a>
                          )}
                        </div>
                      )}

                      <div className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-2">
                        Amendment Text
                      </div>
                      <div className="text-sm text-ink-900 whitespace-pre-wrap leading-relaxed">
                        {amendment.text}
                      </div>

                      {amendment.sourceUrl && (
                        <a
                          href={amendment.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2.5 text-xs text-accent-600 hover:text-accent-700 underline"
                        >
                          View full amendment
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckTabs } from '@/components/checks/CheckTabs';
import { PromptEditor } from '@/components/prompts/PromptEditor';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { ScreenshotGallery } from '@/components/screenshots/ScreenshotGallery';
import { PDFViewerWrapper as PDFViewer } from '@/components/pdf/PDFViewerWrapper';

interface Props {
  assessment: any;
  checks: any[];
  progress: { totalChecks: number; completed: number; pct: number };
}

export default function AssessmentClient({ assessment, checks, progress }: Props) {
  const [activeCheckId, setActiveCheckId] = useState<string | null>(checks[0]?.id || null);
  const activeCheck = useMemo(
    () => checks.find(c => c.id === activeCheckId) || null,
    [checks, activeCheckId]
  );

  const [pdfUrl, _setPdfUrl] = useState<string | null>(assessment?.pdf_url || null);
  const [screenshotsChanged, setScreenshotsChanged] = useState(0);

  useEffect(() => setActiveCheckId(checks[0]?.id || null), [checks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 h-screen">
      <aside className="h-screen border-r flex flex-col overflow-hidden bg-white min-h-0">
        <div className="p-4 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Progress</h2>
            <Link href="/" className="btn-secondary">
              <svg
                width="16"
                height="16"
                className="flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span>My Projects</span>
            </Link>
          </div>

          <div className="space-y-2">
            <div>
              <div
                className="progress"
                style={{ '--value': `${progress.pct}%` } as React.CSSProperties}
              >
                <div className="bar" />
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {progress.completed} of {progress.totalChecks} checks
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1.5">Active Checks</h3>
              <CheckTabs
                checks={checks}
                activeCheckId={activeCheckId}
                onSelect={setActiveCheckId}
              />
            </div>
          </div>
        </div>

        <div className="p-4 overflow-auto space-y-4 min-h-0 flex-1">
          {activeCheck ? (
            <>
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Check Details
                </h3>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">
                    Section {activeCheck.code_section_number} — {activeCheck.code_section_title}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{activeCheck.check_name}</span>
                    {activeCheck.check_location && (
                      <span className="text-gray-600"> — {activeCheck.check_location}</span>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Prompt
                </h3>
                <PromptEditor check={activeCheck} />
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Analysis
                </h3>
                <AnalysisPanel check={activeCheck} onRefresh={() => null} />
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Screenshots
                </h3>
                <ScreenshotGallery check={activeCheck} refreshKey={screenshotsChanged} />
              </section>
            </>
          ) : (
            <div className="text-sm text-gray-600">No check selected.</div>
          )}
        </div>
      </aside>

      <section className="h-screen relative overflow-hidden bg-gray-50 border-2 border-gray-600 min-h-0">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={() => setScreenshotsChanged(x => x + 1)}
          />
        ) : (
          <div className="p-6">No PDF attached to this assessment.</div>
        )}
      </section>
    </div>
  );
}

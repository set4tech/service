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
      <aside className="border-r flex flex-col overflow-hidden bg-white">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Progress</div>
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
          <div
            className="progress mt-2"
            style={{ '--value': `${progress.pct}%` } as React.CSSProperties}
          >
            <div className="bar" />
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {progress.completed} of {progress.totalChecks} checks
          </div>
          <div className="mt-2 text-sm">Active Checks:</div>
          <CheckTabs checks={checks} activeCheckId={activeCheckId} onSelect={setActiveCheckId} />
        </div>

        <div className="p-3 overflow-auto stack-md">
          {activeCheck ? (
            <>
              <div className="text-sm text-gray-600 mb-2">
                Section {activeCheck.code_section_number} — {activeCheck.code_section_title}
              </div>
              <div className="text-sm">
                Check: <span className="font-medium">{activeCheck.check_name}</span>{' '}
                {activeCheck.check_location ? `— ${activeCheck.check_location}` : null}
              </div>

              <PromptEditor check={activeCheck} />
              <AnalysisPanel check={activeCheck} onRefresh={() => null} />
              <ScreenshotGallery check={activeCheck} refreshKey={screenshotsChanged} />
            </>
          ) : (
            <div className="text-sm text-gray-600">No check selected.</div>
          )}
        </div>
      </aside>

      <section className="relative overflow-hidden bg-gray-50 border border-gray-300">
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

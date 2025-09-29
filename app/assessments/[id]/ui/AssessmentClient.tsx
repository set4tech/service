'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckList } from '@/components/checks/CheckList';
import { PDFViewerWrapper as PDFViewer } from '@/components/pdf/PDFViewerWrapper';
import { ScreenshotGallery } from '@/components/screenshots/ScreenshotGallery';

interface Props {
  assessment: any;
  checks: any[];
  progress: { totalChecks: number; completed: number; pct: number };
}

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
  progress: initialProgress,
}: Props) {
  const [checks] = useState(initialChecks);
  const [progress] = useState(initialProgress);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(checks[0]?.id || null);

  const handleCheckSelect = (checkId: string) => {
    console.log('AssessmentClient: Setting active check to:', checkId);
    setActiveCheckId(checkId);
  };

  const activeCheck = useMemo(
    () => checks.find(c => c.id === activeCheckId) || null,
    [checks, activeCheckId]
  );

  // Auto-seed checks if empty (only try once)
  const [hasSeedAttempted, setHasSeedAttempted] = useState(false);

  useEffect(() => {
    if (checks.length === 0 && !isSeeding && !hasSeedAttempted) {
      setIsSeeding(true);
      setHasSeedAttempted(true);
      fetch(`/api/assessments/${assessment.id}/seed`, {
        method: 'POST',
      })
        .then(res => {
          if (!res.ok) {
            throw new Error(`Seed failed: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.success && data.seeded > 0) {
            // Reload the page to get fresh data
            window.location.reload();
          }
        })
        .catch(error => {
          console.error('Failed to seed assessment:', error);
          // Don't reset hasSeedAttempted to prevent retry loop
        })
        .finally(() => setIsSeeding(false));
    }
  }, [assessment.id, checks.length, isSeeding, hasSeedAttempted]);

  const [pdfUrl, _setPdfUrl] = useState<string | null>(assessment?.pdf_url || null);
  const [screenshotsChanged, setScreenshotsChanged] = useState(0);

  useEffect(() => setActiveCheckId(checks[0]?.id || null), [checks]);

  if (checks.length === 0 && isSeeding) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Initializing assessment checks...</div>
          <div className="text-sm text-gray-600">Loading building code sections</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      {/* Left Sidebar with Checks */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden relative z-10">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Compliance Checks</h2>
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </Link>
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{Math.round(progress.pct)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {progress.completed} of {progress.totalChecks} checks completed
            </div>
          </div>
        </div>

        {/* Checks List */}
        <div className="flex-1 overflow-hidden min-h-0">
          <CheckList checks={checks} activeCheckId={activeCheckId} onSelect={handleCheckSelect} />
        </div>

        {/* Screenshots for Active Check */}
        {activeCheck && activeCheck.screenshots?.length > 0 && (
          <div className="border-t p-4 max-h-64 overflow-y-auto flex-shrink-0">
            <ScreenshotGallery check={activeCheck} refreshKey={screenshotsChanged} />
          </div>
        )}
      </div>

      {/* Main Content Area with PDF Viewer */}
      <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={() => setScreenshotsChanged(x => x + 1)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No document</h3>
              <p className="mt-1 text-sm text-gray-500">Upload a PDF to begin the assessment.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

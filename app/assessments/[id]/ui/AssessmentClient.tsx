'use client';

import { useEffect, useMemo, useState } from 'react';
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
    <div className="grid grid-cols-2 h-full">
      <div className="border-r flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="text-sm font-medium">Progress</div>
          <div className="h-2 bg-gray-200 rounded mt-2">
            <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="text-xs mt-1">
            {progress.completed} of {progress.totalChecks} checks
          </div>
          <div className="mt-2 text-sm">Active Checks:</div>
          <CheckTabs checks={checks} activeCheckId={activeCheckId} onSelect={setActiveCheckId} />
        </div>

        <div className="p-3 overflow-auto">
          {activeCheck ? (
            <>
              <div className="text-sm text-gray-600 mb-2">
                Section {activeCheck.code_section_number} — {activeCheck.code_section_title}
              </div>
              <div className="text-sm">
                Check: <span className="font-medium">{activeCheck.check_name}</span>{' '}
                {activeCheck.check_location ? `— ${activeCheck.check_location}` : null}
              </div>

              <div className="mt-3">
                <PromptEditor check={activeCheck} />
              </div>

              <div className="mt-3">
                <AnalysisPanel check={activeCheck} onRefresh={() => null} />
              </div>

              <div className="mt-3">
                <ScreenshotGallery check={activeCheck} refreshKey={screenshotsChanged} />
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600">No check selected.</div>
          )}
        </div>
      </div>

      <div className="overflow-hidden">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={() => setScreenshotsChanged(x => x + 1)}
          />
        ) : (
          <div className="p-6">No PDF attached to this assessment.</div>
        )}
      </div>
    </div>
  );
}

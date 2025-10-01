'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CheckList } from '@/components/checks/CheckList';
import { ScreenshotGallery } from '@/components/screenshots/ScreenshotGallery';
import { CodeDetailPanel } from '@/components/checks/CodeDetailPanel';

// Load PDF viewer only on client side - removes need for wrapper component
const PDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading PDF viewer...</div>
      </div>
    ),
  }
);

interface Props {
  assessment: any;
  checks: any[];
  progress: { totalChecks: number; completed: number; pct: number };
}

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
}: Props) {
  const [checks, setChecks] = useState(initialChecks);

  // Calculate progress dynamically from checks state
  const progress = useMemo(() => {
    const totalChecks = checks.length;
    // Count checks with AI assessment OR manual override (but not not_applicable)
    const completed = checks.filter(
      c => c.latest_status || c.status === 'completed' ||
           (c.manual_override && c.manual_override !== 'not_applicable')
    ).length;
    const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;
    return { totalChecks, completed, pct };
  }, [checks]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(checks[0]?.id || null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [checksSidebarWidth, setChecksSidebarWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [detailPanelWidth, setDetailPanelWidth] = useState(400);

  // NEW: Streaming progress state
  const [seedingProgress, setSeedingProgress] = useState<{
    processed: number;
    total: number;
    included: number;
  } | null>(null);

  // Background seeding status
  const [backgroundSeeding, setBackgroundSeeding] = useState<{
    active: boolean;
    processed: number;
    total: number;
  }>({ active: false, processed: 0, total: 0 });

  const checksSidebarRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const checksResizerRef = useRef<{ isDragging: boolean; startX: number; startWidth: number }>({
    isDragging: false,
    startX: 0,
    startWidth: 0,
  });
  const detailResizerRef = useRef<{ isDragging: boolean; startX: number; startWidth: number }>({
    isDragging: false,
    startX: 0,
    startWidth: 0,
  });

  const handleCheckSelect = (checkId: string) => {
    setActiveCheckId(checkId);
    setShowDetailPanel(true);
  };

  const activeCheck = useMemo(
    () => checks.find(c => c.id === activeCheckId) || null,
    [checks, activeCheckId]
  );

  // Auto-seed checks if empty (only try once)
  const [hasSeedAttempted, setHasSeedAttempted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`seed-attempted-${assessment.id}`) === 'true';
  });

  useEffect(() => {
    console.log('[AssessmentClient] Effect triggered', {
      checksLength: checks.length,
      isSeeding,
      hasSeedAttempted,
    });

    if (checks.length === 0 && !isSeeding && !hasSeedAttempted) {
      console.log('[AssessmentClient] Starting seed process for assessment:', assessment.id);
      setIsSeeding(true);
      setHasSeedAttempted(true);
      localStorage.setItem(`seed-attempted-${assessment.id}`, 'true');

      // Fetch first batch immediately
      fetch(`/api/assessments/${assessment.id}/seed`, { method: 'POST' })
        .then(async response => {
          console.log('[AssessmentClient] Seed response received:', response.status, response.ok);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[AssessmentClient] Seed failed:', response.status, errorText);
            throw new Error(`Seed failed: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          console.log('[AssessmentClient] Seed data:', data);

          // Set initial progress
          setSeedingProgress({
            processed: data.processed,
            total: data.total,
            included: data.included,
          });

          // Only reload if we actually got some checks
          if (data.included > 0) {
            console.log('[AssessmentClient] Reloading to show first batch...');
            setTimeout(() => window.location.reload(), 500);
          } else {
            console.warn('[AssessmentClient] No checks included in first batch, not reloading');
            setIsSeeding(false);
          }
        })
        .catch(error => {
          console.error('[AssessmentClient] Failed to seed assessment:', error);
          setIsSeeding(false);
        });
    }
  }, [assessment.id, checks.length, isSeeding, hasSeedAttempted]);

  // Poll for background seeding progress
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/assessments/${assessment.id}/status`);
        if (!res.ok) return;

        const data = await res.json();

        // Check if background seeding is active
        const isBackgroundActive = data.seeding_status === 'in_progress' && data.sections_total > 0;

        setBackgroundSeeding({
          active: isBackgroundActive,
          processed: data.sections_processed || 0,
          total: data.sections_total || 0,
        });

        // If seeding completed and we have more checks than before, refresh
        if (data.seeding_status === 'completed' && data.check_count > checks.length) {
          console.log('[AssessmentClient] Background seeding complete, refreshing checks...');
          // Fetch updated checks
          const checksRes = await fetch(`/api/assessments/${assessment.id}/checks`);
          if (checksRes.ok) {
            const updatedChecks = await checksRes.json();
            setChecks(updatedChecks);
          }
        }

        // Stop polling when complete
        if (data.seeding_status === 'completed' && pollInterval) {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('[AssessmentClient] Failed to poll status:', error);
      }
    };

    // Start polling if we have checks (meaning we've already done initial seed)
    if (checks.length > 0 && !isSeeding) {
      pollStatus(); // Check immediately
      pollInterval = setInterval(pollStatus, 3000); // Then every 3 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [assessment.id, checks.length, isSeeding]);

  const [pdfUrl, _setPdfUrl] = useState<string | null>(assessment?.pdf_url || null);
  const [screenshotsChanged, setScreenshotsChanged] = useState(0);

  // Resize handlers for checks sidebar
  const handleChecksResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    checksResizerRef.current = {
      isDragging: true,
      startX: e.clientX,
      startWidth: checksSidebarWidth,
    };
  };

  // Resize handlers for detail panel
  const handleDetailResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    detailResizerRef.current = {
      isDragging: true,
      startX: e.clientX,
      startWidth: detailPanelWidth,
    };
  };

  // Mouse move handler for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (checksResizerRef.current.isDragging) {
        const deltaX = e.clientX - checksResizerRef.current.startX;
        const newWidth = Math.max(280, Math.min(600, checksResizerRef.current.startWidth + deltaX));
        setChecksSidebarWidth(newWidth);
      }

      if (detailResizerRef.current.isDragging) {
        const deltaX = e.clientX - detailResizerRef.current.startX;
        const newWidth = Math.max(300, Math.min(700, detailResizerRef.current.startWidth + deltaX));
        setDetailPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      checksResizerRef.current.isDragging = false;
      detailResizerRef.current.isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Refetch active check's screenshots when a new one is saved
  useEffect(() => {
    if (screenshotsChanged === 0 || !activeCheckId) return;

    const refetchScreenshots = async () => {
      try {
        const res = await fetch(`/api/checks/${activeCheckId}/screenshots`);
        if (res.ok) {
          const screenshots = await res.json();
          setChecks(prev =>
            prev.map(check => (check.id === activeCheckId ? { ...check, screenshots } : check))
          );
        }
      } catch (error) {
        console.error('Failed to refetch screenshots:', error);
      }
    };

    refetchScreenshots();
  }, [screenshotsChanged, activeCheckId]);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Loading Modal */}
      {isSeeding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <h3 className="text-lg font-semibold">Loading Code Sections</h3>
            </div>

            {seedingProgress && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>
                    Processed: {seedingProgress.processed} / {seedingProgress.total}
                  </span>
                  <span className="font-medium text-blue-600">
                    Applicable: {seedingProgress.included}
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${Math.round((seedingProgress.processed / seedingProgress.total) * 100)}%`,
                    }}
                  />
                </div>

                <div className="text-xs text-gray-500 text-center">
                  {Math.round((seedingProgress.processed / seedingProgress.total) * 100)}% complete
                </div>
              </div>
            )}

            <p className="text-sm text-gray-500 mt-4">
              AI is analyzing code sections for applicability to your project. Generic sections and
              irrelevant features are being filtered out.
            </p>
          </div>
        </div>
      )}
      {/* Left Sidebar with Checks */}
      <div
        ref={checksSidebarRef}
        className="flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen overflow-hidden relative z-10"
        style={{ width: `${checksSidebarWidth}px` }}
      >
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

          {/* Background Seeding Banner */}
          {backgroundSeeding.active && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600" />
                <span className="text-xs font-medium text-blue-900">
                  Still retrieving code sections...
                </span>
              </div>
              <div className="text-xs text-blue-700">
                {backgroundSeeding.processed} / {backgroundSeeding.total} processed
              </div>
            </div>
          )}

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
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CheckList checks={checks} activeCheckId={activeCheckId} onSelect={handleCheckSelect} />
        </div>

        {/* Screenshots for Active Check */}
        {activeCheck && activeCheck.screenshots?.length > 0 && (
          <div className="border-t p-4 max-h-64 overflow-y-auto flex-shrink-0">
            <ScreenshotGallery check={activeCheck} refreshKey={screenshotsChanged} />
          </div>
        )}
      </div>

      {/* Resize Handle for Checks Sidebar */}
      <div
        onMouseDown={handleChecksResizeStart}
        className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative z-20"
        style={{ touchAction: 'none' }}
      />

      {/* Code Detail Panel */}
      <div
        ref={detailPanelRef}
        className="flex-shrink-0 h-screen overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          width: showDetailPanel ? `${detailPanelWidth}px` : '0px',
          opacity: showDetailPanel ? 1 : 0,
        }}
      >
        {showDetailPanel && (
          <CodeDetailPanel
            checkId={activeCheck?.id || null}
            sectionKey={activeCheck?.code_section_key || null}
            onClose={() => setShowDetailPanel(false)}
            onCheckUpdate={async () => {
              if (activeCheck?.id) {
                try {
                  const res = await fetch(`/api/checks/${activeCheck.id}`);
                  if (res.ok) {
                    const { check: updatedCheck } = await res.json();
                    setChecks(prev =>
                      prev.map(c => (c.id === updatedCheck.id ? { ...c, ...updatedCheck, instances: c.instances } : c))
                    );
                  }
                } catch (error) {
                  console.error('Failed to refetch check:', error);
                }
              }
            }}
          />
        )}
      </div>

      {/* Resize Handle for Detail Panel */}
      {showDetailPanel && (
        <div
          onMouseDown={handleDetailResizeStart}
          className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative z-20"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Main Content Area with PDF Viewer */}
      <div className="flex-1 bg-gray-50 overflow-hidden h-screen">
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

'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckList } from '@/components/checks/CheckList';
import { CodeDetailPanel } from '@/components/checks/CodeDetailPanel';
import { ViolationsSummary } from '@/components/checks/ViolationsSummary';

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

interface BuildingInfo {
  occupancy: string;
  size_sf: number | null;
  stories: number | null;
  work_type: string;
  has_parking: boolean | null;
  facility_category: string;
}

interface Codebook {
  id: string;
  name: string;
}

interface Props {
  assessment: any;
  checks: any[];
  progress: { totalChecks: number; completed: number; pct: number };
  buildingInfo: BuildingInfo;
  codebooks: Codebook[];
}

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
  progress: _initialProgress,
  buildingInfo,
  codebooks,
}: Props) {
  const [checks, setChecks] = useState(initialChecks);

  // Debug: Log screenshots on initial load
  useEffect(() => {
    const checksWithScreenshots = initialChecks.filter((c: any) => c.screenshots?.length > 0);
    const instancesWithScreenshots = initialChecks
      .flatMap((c: any) => c.instances || [])
      .filter((i: any) => i.screenshots?.length > 0);

    console.log(
      '[AssessmentClient] Initial checks with screenshots:',
      checksWithScreenshots.length
    );
    console.log(
      '[AssessmentClient] Initial INSTANCES with screenshots:',
      instancesWithScreenshots.length
    );

    instancesWithScreenshots.slice(0, 5).forEach((i: any) => {
      console.log(`  - ${i.instance_label}: ${i.screenshots.length} screenshots`);
    });
  }, []);
  const [checkMode, setCheckMode] = useState<'section' | 'element' | 'summary'>('section');

  // Restore saved mode after hydration to avoid mismatch
  useEffect(() => {
    const saved = localStorage.getItem(`checkMode-${assessment.id}`);
    if (saved) {
      setCheckMode(saved as 'section' | 'element' | 'summary');
    }
  }, [assessment.id]);

  // Filter checks by mode (skip filtering for summary mode)
  const displayedChecks = useMemo(() => {
    if (checkMode === 'summary') return checks;
    return checks.filter(c => {
      const type = c.check_type || 'section';
      return type === checkMode;
    });
  }, [checks, checkMode]);

  // Calculate progress dynamically from checks state (all checks, not filtered)
  const progress = useMemo(() => {
    // Exclude checks marked as not_applicable from total count
    const applicableChecks = checks.filter(c => c.manual_override !== 'not_applicable');
    const totalChecks = applicableChecks.length;
    // Count checks with AI assessment OR manual override OR section overrides (but not not_applicable)
    const completed = applicableChecks.filter(
      c =>
        c.latest_status ||
        c.status === 'completed' ||
        (c.manual_override && c.manual_override !== 'not_applicable') ||
        c.has_section_overrides
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

  const handleCheckAdded = (newCheck: any) => {
    // Add the new check to the state
    setChecks(prevChecks => {
      // Find the parent check
      const parentCheck = prevChecks.find(c => c.id === newCheck.parent_check_id);

      if (parentCheck) {
        // Only add to parent's instances array, NOT as a top-level item
        return prevChecks.map(c => {
          if (c.id === newCheck.parent_check_id) {
            return {
              ...c,
              instances: [...(c.instances || []), newCheck],
              instance_count: (c.instance_count || 0) + 1,
            };
          }
          return c;
        });
      }

      // If no parent, add as new check
      return [...prevChecks, { ...newCheck, instances: [], instance_count: 0 }];
    });
  };

  const handleCheckDeleted = (checkId: string) => {
    // Remove the check from the state
    setChecks(prevChecks => {
      // First check if it's a top-level check
      let deletedCheck = prevChecks.find(c => c.id === checkId);

      // If not found in top-level, search in instances
      if (!deletedCheck) {
        for (const parentCheck of prevChecks) {
          const instance = (parentCheck.instances || []).find((inst: any) => inst.id === checkId);
          if (instance) {
            deletedCheck = instance;
            break;
          }
        }
      }

      if (!deletedCheck) {
        console.error('[handleCheckDeleted] Check not found:', checkId);
        return prevChecks;
      }

      // If it's a top-level check, remove it from main array
      if (!deletedCheck.parent_check_id) {
        return prevChecks.filter(c => c.id !== checkId);
      }

      // If it's an instance, remove from parent's instances array
      return prevChecks.map(c => {
        if (c.id === deletedCheck.parent_check_id) {
          return {
            ...c,
            instances: (c.instances || []).filter((inst: any) => inst.id !== checkId),
            instance_count: Math.max((c.instance_count || 0) - 1, 0),
          };
        }
        return c;
      });
    });

    // If the deleted check was active, clear the active check
    if (activeCheckId === checkId) {
      setActiveCheckId(null);
    }
  };

  const activeCheck = useMemo(() => {
    // First try to find the check directly
    const directMatch = checks.find(c => c.id === activeCheckId);
    if (directMatch) return directMatch;

    // If not found, search within instances
    for (const check of checks) {
      if (check.instances?.length > 0) {
        const instance = check.instances.find((i: any) => i.id === activeCheckId);
        if (instance) return instance;
      }
    }

    return null;
  }, [checks, activeCheckId]);

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

  // Poll for batch seeding progress
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const pollAndContinue = async () => {
      try {
        // Check current status
        const statusRes = await fetch(`/api/assessments/${assessment.id}/status`);
        if (!statusRes.ok) return;

        const statusData = await statusRes.json();

        // Update background seeding state
        const isActive =
          statusData.seeding_status === 'in_progress' && statusData.sections_total > 0;
        setBackgroundSeeding({
          active: isActive,
          processed: statusData.sections_processed || 0,
          total: statusData.sections_total || 0,
        });

        // If seeding is in progress, call seed API to process next batch
        if (statusData.seeding_status === 'in_progress') {
          const seedRes = await fetch(`/api/assessments/${assessment.id}/seed`, {
            method: 'POST',
          });

          if (seedRes.ok) {
            const seedData = await seedRes.json();
            console.log('[AssessmentClient] Batch processed:', seedData);

            // Refresh checks if we got new ones
            const checksRes = await fetch(`/api/assessments/${assessment.id}/checks`);
            if (checksRes.ok) {
              const updatedChecks = await checksRes.json();
              if (updatedChecks.length > checks.length) {
                setChecks(updatedChecks);
              }
            }

            // If completed, stop polling
            if (seedData.status === 'completed') {
              clearInterval(pollInterval);
              setBackgroundSeeding({ active: false, processed: 0, total: 0 });
            }
          }
        } else if (statusData.seeding_status === 'completed') {
          // Stop polling if already completed
          clearInterval(pollInterval);
          setBackgroundSeeding({ active: false, processed: 0, total: 0 });
        }
      } catch (error) {
        console.error('[AssessmentClient] Polling error:', error);
      }
    };

    // Start polling after initial seed attempt completes
    if (hasSeedAttempted && !isSeeding) {
      pollAndContinue(); // Start immediately
      pollInterval = setInterval(pollAndContinue, 2000); // Poll every 2 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [assessment.id, checks.length, hasSeedAttempted, isSeeding]);

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
            prev.map(check => {
              // Update top-level check if it matches
              if (check.id === activeCheckId) {
                return { ...check, screenshots };
              }
              // Update instance within check if it matches
              if (check.instances?.length > 0) {
                const updatedInstances = check.instances.map((instance: any) =>
                  instance.id === activeCheckId ? { ...instance, screenshots } : instance
                );
                if (updatedInstances !== check.instances) {
                  return { ...check, instances: updatedInstances };
                }
              }
              return check;
            })
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

          {/* Mode Toggle */}
          <div className="mb-3 flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setCheckMode('section');
                localStorage.setItem(`checkMode-${assessment.id}`, 'section');
              }}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'section'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              By Section
            </button>
            <button
              onClick={() => {
                setCheckMode('element');
                localStorage.setItem(`checkMode-${assessment.id}`, 'element');
              }}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'element'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              By Element
            </button>
            <button
              onClick={() => {
                setCheckMode('summary');
                localStorage.setItem(`checkMode-${assessment.id}`, 'summary');
              }}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'summary'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Summary
            </button>
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
          {checkMode === 'summary' ? (
            <ViolationsSummary
              checks={checks}
              onCheckSelect={handleCheckSelect}
              buildingInfo={buildingInfo}
              codebooks={codebooks}
            />
          ) : (
            <CheckList
              checks={displayedChecks}
              checkMode={checkMode === 'section' ? 'section' : 'element'}
              activeCheckId={activeCheckId}
              onSelect={handleCheckSelect}
              assessmentId={assessment.id}
              onCheckAdded={handleCheckAdded}
              onCheckDeleted={handleCheckDeleted}
            />
          )}
        </div>
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
            activeCheck={activeCheck}
            screenshotsRefreshKey={screenshotsChanged}
            onClose={() => setShowDetailPanel(false)}
            onCheckUpdate={async () => {
              if (activeCheck?.id) {
                try {
                  const res = await fetch(`/api/checks/${activeCheck.id}`);
                  if (res.ok) {
                    const { check: updatedCheck } = await res.json();
                    setChecks(prev =>
                      prev.map(c => {
                        // Update top-level check if it matches
                        if (c.id === updatedCheck.id) {
                          return { ...c, ...updatedCheck, instances: c.instances };
                        }
                        // Update instance within check if it matches
                        if (c.instances?.length > 0) {
                          const updatedInstances = c.instances.map((instance: any) =>
                            instance.id === updatedCheck.id
                              ? { ...instance, ...updatedCheck }
                              : instance
                          );
                          if (updatedInstances !== c.instances) {
                            return { ...c, instances: updatedInstances };
                          }
                        }
                        return c;
                      })
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
            assessmentId={assessment.id}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={() => setScreenshotsChanged(x => x + 1)}
            onCheckAdded={handleCheckAdded}
            onCheckSelect={handleCheckSelect}
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

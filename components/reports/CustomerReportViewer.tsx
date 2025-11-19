'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ProjectViolationsData,
  ViolationMarker,
  CommentMarker,
} from '@/lib/reports/get-violations';
import { ViolationListSidebar } from './ViolationListSidebar';
import { ViolationDetailModal } from './ViolationDetailModal';
import { CommentListSidebar } from './CommentListSidebar';
import { CommentDetailModal } from '@/components/comments/CommentDetailModal';
import { BlueprintLoader } from './BlueprintLoader';
import { CalculationTablesBrowser } from './CalculationTablesBrowser';
import { CodeInformation } from './CodeInformation';

// Load PDF viewer only on client side
const PDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => <BlueprintLoader />,
  }
);

interface Props {
  data: ProjectViolationsData;
}

export function CustomerReportViewer({ data }: Props) {
  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);
  const [selectedComment, setSelectedComment] = useState<CommentMarker | null>(null);
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  const [modalViolation, setModalViolation] = useState<ViolationMarker | null>(null);
  const [modalComment, setModalComment] = useState<CommentMarker | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [sidebarView, setSidebarView] = useState<
    'violations' | 'comments' | 'building-info' | 'code-info' | 'tables'
  >('violations');
  const [isNavHovered, setIsNavHovered] = useState(false);

  const handleNavClick = (
    view: 'violations' | 'comments' | 'building-info' | 'code-info' | 'tables'
  ) => {
    setSidebarView(view);
  };

  // Stable callback for page changes
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleViolationClick = useCallback((violation: ViolationMarker) => {
    console.log('[CustomerReportViewer] handleViolationClick called', {
      checkId: violation.checkId,
      allScreenshots: violation.allScreenshots,
      screenshotCount: violation.allScreenshots.length,
    });

    // Just navigate to the violation and center it, don't open modal
    // Reset to first screenshot when clicking a new violation
    setCurrentScreenshotIndex(0);
    const firstScreenshot = violation.allScreenshots[0] || violation;

    console.log('[CustomerReportViewer] First screenshot:', {
      id: firstScreenshot.id,
      pageNumber: firstScreenshot.pageNumber,
      bounds: firstScreenshot.bounds,
    });

    setCurrentPage(firstScreenshot.pageNumber || violation.pageNumber);
    setSelectedViolation(violation);
  }, []);

  // Screenshot navigation handlers (for PDF viewer arrows)
  const handleNextScreenshot = useCallback(() => {
    if (!selectedViolation || selectedViolation.allScreenshots.length <= 1) return;

    const nextIndex = Math.min(
      currentScreenshotIndex + 1,
      selectedViolation.allScreenshots.length - 1
    );
    if (nextIndex !== currentScreenshotIndex) {
      setCurrentScreenshotIndex(nextIndex);
      const nextScreenshot = selectedViolation.allScreenshots[nextIndex];
      setCurrentPage(nextScreenshot.pageNumber);
    }
  }, [selectedViolation, currentScreenshotIndex]);

  const handlePrevScreenshot = useCallback(() => {
    if (!selectedViolation || selectedViolation.allScreenshots.length <= 1) return;

    const prevIndex = Math.max(currentScreenshotIndex - 1, 0);
    if (prevIndex !== currentScreenshotIndex) {
      setCurrentScreenshotIndex(prevIndex);
      const prevScreenshot = selectedViolation.allScreenshots[prevIndex];
      setCurrentPage(prevScreenshot.pageNumber);
    }
  }, [selectedViolation, currentScreenshotIndex]);

  const handleViolationDetailsClick = useCallback((violation: ViolationMarker) => {
    // Open the modal with full details
    setModalViolation(violation);
    setCurrentPage(violation.pageNumber);
  }, []);

  // Comment handlers
  const handleCommentClick = useCallback((comment: CommentMarker) => {
    console.log('[CustomerReportViewer] handleCommentClick called', {
      commentId: comment.commentId,
      screenshots: comment.screenshots,
      screenshotCount: comment.screenshots.length,
    });

    // Navigate to the comment and center it
    setCurrentScreenshotIndex(0);
    const firstScreenshot = comment.screenshots[0];

    if (firstScreenshot) {
      setCurrentPage(firstScreenshot.pageNumber || comment.pageNumber);
    } else {
      setCurrentPage(comment.pageNumber);
    }
    setSelectedComment(comment);
    setSelectedViolation(null); // Clear violation selection
  }, []);

  const handleCommentDetailsClick = useCallback((comment: CommentMarker) => {
    // Open the modal with full details
    setModalComment(comment);
    setCurrentPage(comment.pageNumber);
  }, []);

  // Compute highlighted violation ID for centering in PDF viewer
  // Include screenshot index so we highlight the correct bbox
  // Use ::: as delimiter since both IDs are UUIDs that contain dashes
  const highlightedViolationId = selectedViolation
    ? `${selectedViolation.checkId}:::${selectedViolation.allScreenshots[currentScreenshotIndex]?.id || selectedViolation.screenshotId}`
    : null;

  console.log('[CustomerReportViewer] highlightedViolationId:', {
    highlightedViolationId,
    selectedViolation: selectedViolation?.checkId,
    currentScreenshotIndex,
    screenshotId: selectedViolation?.allScreenshots[currentScreenshotIndex]?.id,
  });

  // Get current screenshot info for display
  const currentScreenshotInfo = selectedViolation
    ? {
        current: currentScreenshotIndex + 1,
        total: selectedViolation.allScreenshots.length,
        canGoPrev: currentScreenshotIndex > 0,
        canGoNext: currentScreenshotIndex < selectedViolation.allScreenshots.length - 1,
      }
    : null;

  const handleCloseModal = useCallback(() => {
    setModalViolation(null);
  }, []);

  const handleNextViolation = useCallback(() => {
    if (!modalViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === modalViolation.checkId);
    const nextIndex = (currentIndex + 1) % data.violations.length;
    const nextViolation = data.violations[nextIndex];
    setModalViolation(nextViolation);
    setCurrentPage(nextViolation.pageNumber);
  }, [modalViolation, data.violations]);

  const handlePrevViolation = useCallback(() => {
    if (!modalViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === modalViolation.checkId);
    const prevIndex = (currentIndex - 1 + data.violations.length) % data.violations.length;
    const prevViolation = data.violations[prevIndex];
    setModalViolation(prevViolation);
    setCurrentPage(prevViolation.pageNumber);
  }, [modalViolation, data.violations]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const { exportCompliancePDF } = await import('@/lib/reports/export-pdf');
      await exportCompliancePDF({
        pdfUrl: data.pdfUrl,
        violations: data.violations,
        projectName: data.projectName,
        assessmentId: data.assessmentId,
        buildingParams: data.buildingParams,
        codeInfo: data.codeInfo,
      });
    } catch (err) {
      console.error('[Export] Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [
    data.pdfUrl,
    data.violations,
    data.projectName,
    data.assessmentId,
    data.buildingParams,
    data.codeInfo,
  ]);

  // Group violations by severity for stats
  const violationStats = useMemo(() => {
    return data.violations.reduce(
      (acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      },
      { major: 0, moderate: 0, minor: 0, needs_more_info: 0 } as Record<string, number>
    );
  }, [data.violations]);

  // Extract building parameters into a flat list
  const buildingParams = useMemo(() => {
    // Helper to format building parameter values
    const formatParamValue = (value: unknown): string => {
      if (value === null || value === undefined) return '—';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) return value.join(', ');
      if (typeof value === 'object' && value !== null && 'value' in value) {
        return formatParamValue(value.value);
      }
      return String(value);
    };

    if (!data.buildingParams) return [];

    const params: Array<{ label: string; value: string }> = [];
    const bp = data.buildingParams;

    // Project Identity
    if (bp.project_identity?.full_address) {
      params.push({ label: 'Address', value: formatParamValue(bp.project_identity.full_address) });
    }
    if (bp.project_identity?.authority_having_jurisdiction) {
      params.push({
        label: 'Jurisdiction',
        value: formatParamValue(bp.project_identity.authority_having_jurisdiction),
      });
    }

    // Building Characteristics
    if (bp.building_characteristics?.occupancy_classification) {
      params.push({
        label: 'Occupancy',
        value: formatParamValue(bp.building_characteristics.occupancy_classification),
      });
    }
    if (bp.building_characteristics?.number_of_stories) {
      params.push({
        label: 'Stories',
        value: formatParamValue(bp.building_characteristics.number_of_stories),
      });
    }
    if (bp.building_characteristics?.has_parking !== undefined) {
      params.push({
        label: 'Parking',
        value: formatParamValue(bp.building_characteristics.has_parking),
      });
    }
    if (bp.building_characteristics?.has_mezzanine !== undefined) {
      params.push({
        label: 'Mezzanine',
        value: formatParamValue(bp.building_characteristics.has_mezzanine),
      });
    }
    if (bp.building_characteristics?.has_exterior_routes !== undefined) {
      params.push({
        label: 'Exterior Routes',
        value: formatParamValue(bp.building_characteristics.has_exterior_routes),
      });
    }
    if (bp.building_characteristics?.elevator_exemption_applies !== undefined) {
      params.push({
        label: 'Elevator Exemption',
        value: formatParamValue(bp.building_characteristics.elevator_exemption_applies),
      });
    }

    // Project Scope
    if (bp.project_scope?.work_type) {
      params.push({ label: 'Work Type', value: formatParamValue(bp.project_scope.work_type) });
    }
    if (bp.project_scope?.permit_date) {
      params.push({ label: 'Permit Date', value: formatParamValue(bp.project_scope.permit_date) });
    }

    // Facility Type
    if (bp.facility_type?.category) {
      params.push({ label: 'Facility Type', value: formatParamValue(bp.facility_type.category) });
    }
    if (bp.facility_type?.is_public_accommodation !== undefined) {
      params.push({
        label: 'Public Accommodation',
        value: formatParamValue(bp.facility_type.is_public_accommodation),
      });
    }

    // Ownership
    if (bp.ownership?.owner_type) {
      params.push({ label: 'Ownership', value: formatParamValue(bp.ownership.owner_type) });
    }

    // Funding
    if (bp.funding_sources?.funding_type) {
      params.push({ label: 'Funding', value: formatParamValue(bp.funding_sources.funding_type) });
    }
    if (bp.funding_sources?.has_federal_assistance !== undefined) {
      params.push({
        label: 'Federal Assistance',
        value: formatParamValue(bp.funding_sources.has_federal_assistance),
      });
    }

    return params;
  }, [data.buildingParams]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      {/* Dark Green Navigation Sidebar - Peek icons with glow on hover */}
      <div
        className="fixed left-0 top-0 h-screen w-[60px] bg-emerald-900 z-20 flex flex-col items-center py-6 gap-4 transition-all duration-200"
        onMouseEnter={() => setIsNavHovered(true)}
        onMouseLeave={() => setIsNavHovered(false)}
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            rgba(255, 255, 255, 0.03) 0px,
            rgba(255, 255, 255, 0.03) 2px,
            transparent 2px,
            transparent 6px
          )`,
          boxShadow: isNavHovered
            ? '2px 0 12px rgba(255, 255, 255, 0.1), 2px 0 6px rgba(255, 255, 255, 0.15)'
            : '2px 0 8px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Logo at top */}
        <div className="mb-2">
          <img src="/set4-logo.svg" alt="Set4" className="w-10 h-10" />
        </div>

        <button
          onClick={() => handleNavClick('violations')}
          className={`p-3 rounded-lg transition-all ${
            sidebarView === 'violations'
              ? 'bg-danger-600 text-white shadow-lg'
              : 'text-emerald-100 hover:text-white hover:bg-emerald-800'
          }`}
          style={{
            opacity: isNavHovered ? 1 : 0.7,
          }}
          title="View Violations"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </button>

        <button
          onClick={() => handleNavClick('comments')}
          className={`p-3 rounded-lg transition-all ${
            sidebarView === 'comments'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-emerald-100 hover:text-white hover:bg-emerald-800'
          }`}
          style={{
            opacity: isNavHovered ? 1 : 0.7,
          }}
          title="View Comments"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
        </button>

        <button
          onClick={() => handleNavClick('building-info')}
          className={`p-3 rounded-lg transition-all ${
            sidebarView === 'building-info'
              ? 'bg-accent-600 text-white shadow-lg'
              : 'text-emerald-100 hover:text-white hover:bg-emerald-800'
          }`}
          style={{
            opacity: isNavHovered ? 1 : 0.7,
          }}
          title="Building Information"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </button>

        <button
          onClick={() => handleNavClick('code-info')}
          className={`p-3 rounded-lg transition-all ${
            sidebarView === 'code-info'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-emerald-100 hover:text-white hover:bg-emerald-800'
          }`}
          style={{
            opacity: isNavHovered ? 1 : 0.7,
          }}
          title="Code Information"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </button>

        <button
          onClick={() => handleNavClick('tables')}
          className={`p-3 rounded-lg transition-all ${
            sidebarView === 'tables'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-emerald-100 hover:text-white hover:bg-emerald-800'
          }`}
          style={{
            opacity: isNavHovered ? 1 : 0.7,
          }}
          title="See calculation tables"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {/* White Content Sidebar - Slides right on nav hover */}
      <div
        className={`w-96 flex-shrink-0 bg-white border-r border-line flex flex-col h-screen overflow-hidden z-30 fixed transition-all duration-200 ease-in-out ${
          isNavHovered ? 'left-[60px]' : 'left-[30px]'
        }`}
        style={{
          boxShadow: '-2px 0 4px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-line bg-white">
          <h1 className="text-xl font-medium text-ink-900 mb-1">{data.projectName}</h1>
          <p className="text-sm text-ink-500">Plan Review: Accessibility</p>

          {/* Violation Summary - Only show when in violations view */}
          {sidebarView === 'violations' && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold text-danger-600 font-mono">
                  {violationStats.major || 0}
                </div>
                <div className="text-[10px] text-ink-500 uppercase font-medium tracking-wide">
                  Major
                </div>
              </div>
              <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold text-yellow-700 font-mono">
                  {violationStats.moderate || 0}
                </div>
                <div className="text-[10px] text-ink-500 uppercase font-medium tracking-wide">
                  Moderate
                </div>
              </div>
              <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold text-accent-600 font-mono">
                  {violationStats.minor || 0}
                </div>
                <div className="text-[10px] text-ink-500 uppercase font-medium tracking-wide">
                  Minor
                </div>
              </div>
              <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
                <div className="text-2xl font-semibold text-blue-600 font-mono">
                  {violationStats.needs_more_info || 0}
                </div>
                <div className="text-[10px] text-ink-500 uppercase font-medium tracking-wide">
                  Needs Info
                </div>
              </div>
            </div>
          )}

          {/* Export Button - Only show when in violations view */}
          {sidebarView === 'violations' && data.violations.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="mt-4 w-full px-4 py-3 rounded-lg border-2 border-accent-600 bg-accent-600 text-white font-semibold text-sm hover:bg-accent-700 hover:border-accent-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export PDF Report
                </>
              )}
            </button>
          )}
        </div>

        {/* Sidebar Content */}
        {sidebarView === 'violations' ? (
          <ViolationListSidebar
            violations={data.violations}
            selectedViolation={selectedViolation}
            onViolationClick={handleViolationClick}
            onViolationDetailsClick={handleViolationDetailsClick}
            currentPage={currentPage}
          />
        ) : sidebarView === 'comments' ? (
          <CommentListSidebar
            comments={data.comments || []}
            selectedComment={selectedComment}
            onCommentClick={handleCommentClick}
            onCommentDetailsClick={handleCommentDetailsClick}
            currentPage={currentPage}
          />
        ) : sidebarView === 'building-info' ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <h2 className="text-lg font-semibold text-ink-900 mb-4">Building Information</h2>
            {buildingParams.length > 0 ? (
              <div className="space-y-3">
                {buildingParams.map((param, idx) => (
                  <div key={idx} className="border-b border-line pb-3 last:border-b-0">
                    <div className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-1">
                      {param.label}
                    </div>
                    <div className="text-sm text-ink-900">{param.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No building parameters available</p>
            )}
          </div>
        ) : sidebarView === 'code-info' ? (
          <CodeInformation assessmentId={data.assessmentId} codeInfo={data.codeInfo ?? null} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <CalculationTablesBrowser assessmentId={data.assessmentId} />
          </div>
        )}
      </div>

      {/* Main Content - PDF Viewer - Offset by sidebar position */}
      <div
        className={`flex-1 overflow-hidden h-screen transition-all duration-200 ease-in-out ${
          isNavHovered ? 'ml-[444px]' : 'ml-[414px]'
        }`}
      >
        <PDFViewer
          pdfUrl={data.pdfUrl}
          readOnly={true}
          violationMarkers={data.violations}
          onMarkerClick={handleViolationDetailsClick}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          highlightedViolationId={highlightedViolationId}
          screenshotNavigation={
            currentScreenshotInfo && currentScreenshotInfo.total > 1
              ? {
                  current: currentScreenshotInfo.current,
                  total: currentScreenshotInfo.total,
                  onNext: handleNextScreenshot,
                  onPrev: handlePrevScreenshot,
                  canGoNext: currentScreenshotInfo.canGoNext,
                  canGoPrev: currentScreenshotInfo.canGoPrev,
                }
              : undefined
          }
        />
      </div>

      {/* Violation Detail Modal */}
      {modalViolation && (
        <ViolationDetailModal
          violation={modalViolation}
          onClose={handleCloseModal}
          onNext={handleNextViolation}
          onPrev={handlePrevViolation}
          totalViolations={data.violations.length}
          currentIndex={data.violations.findIndex(v => v.checkId === modalViolation.checkId) + 1}
        />
      )}

      {/* Comment Detail Modal */}
      {modalComment && (
        <CommentDetailModal
          comment={modalComment}
          assessmentId={data.assessmentId}
          onClose={() => setModalComment(null)}
          onUpdate={updatedComment => {
            console.log('[CustomerReportViewer] Comment updated:', updatedComment);
            setModalComment(null);
            // Note: In read-only report view, we probably don't want to allow updates
            // This modal is just for viewing details
          }}
          onDelete={() => {
            console.log('[CustomerReportViewer] Comment deleted');
            setModalComment(null);
            // Note: In read-only report view, we probably don't want to allow deletion
          }}
        />
      )}
    </div>
  );
}

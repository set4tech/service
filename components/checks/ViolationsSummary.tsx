'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ViolationListSidebar } from '@/components/reports/ViolationListSidebar';
import { ViolationMarker, CommentMarker } from '@/lib/reports/get-violations';
import { processRpcRowsToViolations } from '@/lib/reports/process-violations';
import { CommentDetailModal } from '@/components/comments/CommentDetailModal';

// Dynamically load PDF viewer (client-side only)
const PDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-sm text-sage-600">Loading PDF viewer...</div>
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
  checks: any[];
  rpcViolations?: any[]; // Pre-filtered violation data from RPC
  onCheckSelect: (checkId: string, sectionKey?: string) => void;
  onViolationSelect?: (violation: ViolationMarker | null) => void; // Notify parent of selected violation
  onEditCheck?: (violation: ViolationMarker) => void; // Navigate to edit check in CodeDetailPanel
  buildingInfo: BuildingInfo;
  codebooks: Codebook[];
  pdfUrl?: string;
  projectName?: string;
  assessmentId?: string;
  embedded?: boolean; // If true, only render sidebar (used in AssessmentClient)
  onRefresh?: () => void; // Callback to refresh violations data
  refreshing?: boolean; // Loading state for refresh
}

export function ViolationsSummary({
  checks,
  rpcViolations,
  onCheckSelect,
  onViolationSelect,
  onEditCheck,
  buildingInfo: _buildingInfo,
  codebooks: _codebooks,
  pdfUrl,
  projectName,
  assessmentId,
  embedded = false,
  onRefresh,
  refreshing = false,
}: Props) {
  // Debug: Check if props are passed correctly
  console.log('[ViolationsSummary] Props:', {
    hasOnRefresh: !!onRefresh,
    refreshing,
    embedded,
    onRefreshType: typeof onRefresh,
  });

  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    new Set(['major', 'moderate', 'minor', 'needs_more_info'])
  );
  const [highlightedViolationId, setHighlightedViolationId] = useState<string | null>(null);

  // NEW: View mode toggle (violations vs comments)
  const [viewMode, setViewMode] = useState<'violations' | 'comments'>('violations');
  const [comments, setComments] = useState<CommentMarker[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [selectedComment, setSelectedComment] = useState<CommentMarker | null>(null);

  // Fetch comments when assessment ID is available
  const fetchComments = async () => {
    if (!assessmentId) return;

    setLoadingComments(true);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/comments`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      const data = await response.json();
      console.log('[ViolationsSummary] Fetched comments:', data.comments);
      setComments(data.comments || []);
    } catch (error) {
      console.error('[ViolationsSummary] Error fetching comments:', error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  // Handle comment click
  const handleCommentClick = (comment: CommentMarker) => {
    setSelectedComment(comment);
    setCurrentPage(comment.pageNumber);
  };

  // Handle comment navigation in modal
  const currentCommentIndex = selectedComment
    ? comments.findIndex(c => c.commentId === selectedComment.commentId)
    : -1;

  const handleNextComment = () => {
    if (currentCommentIndex < comments.length - 1) {
      setSelectedComment(comments[currentCommentIndex + 1]);
    }
  };

  const handlePrevComment = () => {
    if (currentCommentIndex > 0) {
      setSelectedComment(comments[currentCommentIndex - 1]);
    }
  };

  const handleCommentUpdate = (updatedComment: CommentMarker) => {
    setComments(prev =>
      prev.map(c => (c.commentId === updatedComment.commentId ? updatedComment : c))
    );
    setSelectedComment(updatedComment);
  };

  const handleCommentDelete = () => {
    if (selectedComment) {
      setComments(prev => prev.filter(c => c.commentId !== selectedComment.commentId));
      setSelectedComment(null);
      // Refresh from server
      fetchComments();
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    // Flatten checks to include instances
    const allChecks: any[] = [];
    checks.forEach(check => {
      allChecks.push(check);
      // Add instances if they exist
      if (check.instances && Array.isArray(check.instances)) {
        allChecks.push(...check.instances);
      }
    });

    // Exclude not_applicable and insufficient_information from totals
    const applicableChecks = allChecks.filter(
      c => c.manual_status !== 'not_applicable' && c.manual_status !== 'insufficient_information'
    );
    const totalSections = applicableChecks.length;

    // Count assessed (has AI result OR manual override OR section overrides)
    const assessed = applicableChecks.filter(
      c =>
        c.latest_status ||
        (c.manual_status &&
          c.manual_status !== 'not_applicable' &&
          c.manual_status !== 'insufficient_information')
    ).length;

    // Count currently analyzing (only if updated recently - within 5 minutes)
    const analyzing = applicableChecks.filter(c => {
      if (c.status === 'processing' || c.status === 'analyzing') {
        // Check if updated within last 5 minutes
        const updatedAt = new Date(c.updated_at);
        const minutesAgo = (Date.now() - updatedAt.getTime()) / 1000 / 60;
        return minutesAgo < 5;
      }
      return false;
    });

    const pct = totalSections > 0 ? Math.round((assessed / totalSections) * 100) : 0;

    return { totalSections, assessed, analyzing, pct };
  }, [checks]);

  // Transform RPC violations data to ViolationMarker format
  const violations = useMemo(() => {
    return processRpcRowsToViolations(rpcViolations || []);
  }, [rpcViolations]);

  const handleViolationClick = (violation: ViolationMarker) => {
    setSelectedViolation(violation);
    setCurrentPage(violation.pageNumber);

    // Pass both checkId and sectionKey to filter to specific section
    onCheckSelect(violation.checkId, violation.codeSectionKey);

    // Notify parent of selected violation (for ViolationDetailPanel)
    if (onViolationSelect) {
      onViolationSelect(violation);
    }

    // Trigger highlight pulse
    const highlightId = `${violation.checkId}-${violation.screenshotId}`;
    setHighlightedViolationId(highlightId);
    setTimeout(() => setHighlightedViolationId(null), 2000);
  };

  // Filter violations by severity
  const filteredViolations = useMemo(() => {
    return violations.filter(v => severityFilter.has(v.severity));
  }, [violations, severityFilter]);

  const handleExportPDF = async () => {
    if (!pdfUrl || !projectName || !assessmentId) {
      console.error('[Export] Missing required data for export');
      return;
    }

    setExporting(true);
    try {
      const { exportCompliancePDF } = await import('@/lib/reports/export-pdf');
      await exportCompliancePDF({
        pdfUrl,
        violations,
        projectName,
        assessmentId,
      });
    } catch (err) {
      console.error('[Export] Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getSeverityColor = () => {
    if (violations.length === 0) return 'text-green-300 bg-[#2d4a3d] border-green-700/50';
    if (violations.length >= 6) return 'text-red-300 bg-[#4a2d2d] border-red-700/50';
    return 'text-yellow-300 bg-[#4a4a2d] border-yellow-700/50';
  };

  // If no PDF URL OR embedded mode, show sidebar-only view
  if (!pdfUrl || embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* Compact Stats Header with View Toggle and Refresh Button */}
        <div className="px-4 py-3 border-b border-sage-200 bg-sage-50 space-y-2">
          {/* View Mode Toggle */}
          <div className="flex gap-0 border border-sage-300">
            <button
              onClick={() => setViewMode('violations')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-r border-sage-300 ${
                viewMode === 'violations'
                  ? 'bg-sage-200 text-sage-900 border-l-2 border-l-danger-500'
                  : 'bg-paper text-sage-600 hover:bg-sage-100'
              }`}
            >
              Violations ({violations.length})
            </button>
            <button
              onClick={() => setViewMode('comments')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'comments'
                  ? 'bg-sage-200 text-sage-900 border-l-2 border-l-accent-500'
                  : 'bg-paper text-sage-600 hover:bg-sage-100'
              }`}
            >
              Comments ({loadingComments ? '...' : comments.length})
            </button>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm text-ink-900 flex items-center gap-2">
              {viewMode === 'violations'
                ? `${violations.length} Violation${violations.length === 1 ? '' : 's'}`
                : `${comments.length} Comment${comments.length === 1 ? '' : 's'}`}
              {onRefresh && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onRefresh();
                  }}
                  disabled={refreshing}
                  className="p-1 hover:bg-sage-200 transition-colors disabled:opacity-50"
                  title="Refresh violations"
                >
                  {refreshing ? (
                    <svg
                      className="animate-spin h-4 w-4 text-sage-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
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
                  ) : (
                    <svg
                      className="w-4 h-4 text-sage-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  )}
                </button>
              )}
            </div>
            {viewMode === 'violations' && (
              <div className="text-xs text-sage-600">
                {stats.assessed} / {stats.totalSections} assessed
              </div>
            )}
          </div>
        </div>

        {/* Violations or Comments List */}
        {viewMode === 'violations' ? (
          <ViolationListSidebar
            violations={violations}
            selectedViolation={selectedViolation}
            onViolationClick={handleViolationClick}
            onEditCheck={onEditCheck}
            currentPage={1}
            assessmentId={assessmentId}
            onSeverityFilterChange={setSeverityFilter}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 bg-paper">
            {loadingComments ? (
              <div className="text-center text-sage-600 py-8">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-center text-sage-600 py-8">
                No comments yet. Add coordination or QC comments as needed.
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map(comment => (
                  <div
                    key={comment.commentId}
                    className="border border-sage-200 p-3 bg-sage-50 hover:bg-sage-100 transition-colors cursor-pointer"
                    onClick={() => handleCommentClick(comment)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm text-ink-900">{comment.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 border-l-2 ${
                          comment.severity === 'major'
                            ? 'bg-sage-100 text-sage-800 border-l-danger-500'
                            : comment.severity === 'moderate'
                              ? 'bg-sage-100 text-sage-800 border-l-amber-500'
                              : comment.severity === 'minor'
                                ? 'bg-sage-100 text-sage-800 border-l-accent-500'
                                : 'bg-sage-100 text-sage-800 border-l-sage-500'
                        }`}
                      >
                        {comment.severity}
                      </span>
                    </div>
                    <p className="text-xs text-sage-700 mb-2 line-clamp-2">{comment.description}</p>
                    <div className="flex items-center justify-between text-xs text-sage-600">
                      <div className="flex items-center gap-3">
                        <span>Page {comment.pageNumber}</span>
                        {comment.sheetName && <span>{comment.sheetName}</span>}
                        {comment.discipline && (
                          <span className="px-2 py-0.5 bg-sage-200">{comment.discipline}</span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 ${
                          comment.status === 'open'
                            ? 'bg-sage-100 text-sage-700 border-l-2 border-l-accent-500'
                            : comment.status === 'resolved'
                              ? 'bg-sage-200 text-sage-600'
                              : 'bg-sage-100 text-sage-700 border-l-2 border-l-sage-500'
                        }`}
                      >
                        {comment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comment Detail Modal (embedded view) */}
        {selectedComment && assessmentId && (
          <CommentDetailModal
            comment={selectedComment}
            onClose={() => setSelectedComment(null)}
            onNext={currentCommentIndex < comments.length - 1 ? handleNextComment : undefined}
            onPrev={currentCommentIndex > 0 ? handlePrevComment : undefined}
            onUpdate={handleCommentUpdate}
            onDelete={handleCommentDelete}
            totalComments={comments.length}
            currentIndex={currentCommentIndex}
            assessmentId={assessmentId}
          />
        )}
      </div>
    );
  }

  // Full view with PDF and sidebar
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-100">
      {/* Left Sidebar - Violations List */}
      <div className="w-96 flex-shrink-0 bg-[#3d4a4a] border-r border-[#2d3838] flex flex-col h-screen overflow-hidden relative z-10">
        {/* View Mode Toggle */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('violations')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'violations'
                  ? 'bg-red-900/40 text-red-300 border border-red-700/50'
                  : 'bg-[#4d5a5a] text-slate-300 hover:bg-[#5d6a6a]'
              }`}
            >
              Violations ({violations.length})
            </button>
            <button
              onClick={() => setViewMode('comments')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'comments'
                  ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50'
                  : 'bg-[#4d5a5a] text-slate-300 hover:bg-[#5d6a6a]'
              }`}
            >
              Comments ({loadingComments ? '...' : comments.length})
            </button>
          </div>
        </div>

        {/* Stats Header - Clickable to refresh */}
        <div className="px-4 py-3 border-b border-[#2d3838] space-y-3">
          <div
            className={`px-4 py-3 rounded-lg border ${getSeverityColor()} ${
              onRefresh ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
            }`}
            onClick={onRefresh}
            title={onRefresh ? 'Click to refresh violations' : undefined}
          >
            <div className="flex items-center gap-3">
              {refreshing && (
                <svg className="animate-spin h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24">
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
              )}
              <div className="flex-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  {violations.length === 0 ? (
                    'No Violations Found'
                  ) : (
                    <>
                      {violations.length} Violation{violations.length === 1 ? '' : 's'} Found
                    </>
                  )}
                  {onRefresh && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRefresh();
                      }}
                      disabled={refreshing}
                      className="p-1 rounded hover:bg-white hover:shadow-sm transition-all disabled:opacity-50"
                      title="Refresh violations"
                    >
                      {refreshing ? (
                        <svg
                          className="animate-spin h-4 w-4 text-gray-600"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <div className="text-xs mt-1">
                  {stats.assessed} of {stats.totalSections} sections assessed ({stats.pct}%)
                </div>
              </div>
              {onRefresh && !refreshing && (
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Export Button */}
          {violations.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="w-full px-4 py-3 rounded-lg border-2 border-blue-600 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 hover:border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  Export Report
                </>
              )}
            </button>
          )}
        </div>

        {/* Violations or Comments List */}
        {viewMode === 'violations' ? (
          <ViolationListSidebar
            violations={violations}
            selectedViolation={selectedViolation}
            onViolationClick={handleViolationClick}
            onEditCheck={onEditCheck}
            currentPage={currentPage}
            assessmentId={assessmentId}
            onSeverityFilterChange={setSeverityFilter}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {loadingComments ? (
              <div className="text-center text-slate-400 py-8">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                No comments yet. Add coordination or QC comments as needed.
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map(comment => (
                  <div
                    key={comment.commentId}
                    className="border border-[#2d3838] rounded-lg p-3 bg-[#4d5a5a] hover:bg-[#5d6a6a] transition-colors cursor-pointer"
                    onClick={() => handleCommentClick(comment)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm text-slate-100">{comment.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                          comment.severity === 'major'
                            ? 'bg-red-900/40 text-red-300'
                            : comment.severity === 'moderate'
                              ? 'bg-orange-900/40 text-orange-300'
                              : comment.severity === 'minor'
                                ? 'bg-yellow-900/40 text-yellow-300'
                                : 'bg-blue-900/40 text-blue-300'
                        }`}
                      >
                        {comment.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mb-2 line-clamp-2">
                      {comment.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>Page {comment.pageNumber}</span>
                        {comment.sheetName && <span>{comment.sheetName}</span>}
                        {comment.discipline && (
                          <span className="px-2 py-0.5 bg-[#2d3838] rounded">
                            {comment.discipline}
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded flex-shrink-0 ${
                          comment.status === 'open'
                            ? 'bg-green-900/40 text-green-300'
                            : comment.status === 'resolved'
                              ? 'bg-[#2d3838] text-slate-400'
                              : 'bg-blue-900/40 text-blue-300'
                        }`}
                      >
                        {comment.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content - PDF Viewer with Bounding Boxes */}
      <div className="flex-1 overflow-hidden h-screen">
        <PDFViewer
          pdfUrl={pdfUrl}
          readOnly={true}
          violationMarkers={filteredViolations}
          onMarkerClick={handleViolationClick}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          highlightedViolationId={highlightedViolationId}
        />
      </div>

      {/* Comment Detail Modal */}
      {selectedComment && assessmentId && (
        <CommentDetailModal
          comment={selectedComment}
          onClose={() => setSelectedComment(null)}
          onNext={currentCommentIndex < comments.length - 1 ? handleNextComment : undefined}
          onPrev={currentCommentIndex > 0 ? handlePrevComment : undefined}
          onUpdate={handleCommentUpdate}
          onDelete={handleCommentDelete}
          totalComments={comments.length}
          currentIndex={currentCommentIndex}
          assessmentId={assessmentId}
        />
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ProjectViolationsData, ViolationMarker } from '@/lib/reports/get-violations';
import { ViolationListSidebar } from './ViolationListSidebar';
import { ViolationDetailModal } from './ViolationDetailModal';

// Load PDF viewer only on client side
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
  data: ProjectViolationsData;
}

export function CustomerReportViewer({ data }: Props) {
  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const handleViolationClick = (violation: ViolationMarker) => {
    setSelectedViolation(violation);
    setCurrentPage(violation.pageNumber);
  };

  const handleCloseModal = () => {
    setSelectedViolation(null);
  };

  const handleNextViolation = () => {
    if (!selectedViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === selectedViolation.checkId);
    const nextIndex = (currentIndex + 1) % data.violations.length;
    const nextViolation = data.violations[nextIndex];
    setSelectedViolation(nextViolation);
    setCurrentPage(nextViolation.pageNumber);
  };

  const handlePrevViolation = () => {
    if (!selectedViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === selectedViolation.checkId);
    const prevIndex = (currentIndex - 1 + data.violations.length) % data.violations.length;
    const prevViolation = data.violations[prevIndex];
    setSelectedViolation(prevViolation);
    setCurrentPage(prevViolation.pageNumber);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const { exportCompliancePDF } = await import('@/lib/reports/export-pdf');
      await exportCompliancePDF({
        pdfUrl: data.pdfUrl,
        violations: data.violations,
        projectName: data.projectName,
        assessmentId: data.assessmentId,
      });
    } catch (err) {
      console.error('[Export] Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Group violations by severity for stats
  const violationStats = data.violations.reduce(
    (acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    },
    { major: 0, moderate: 0, minor: 0 } as Record<string, number>
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-paper">
      {/* Left Sidebar - Always visible */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-line flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-line bg-white">
          <h1 className="text-xl font-medium text-ink-900 mb-1">{data.projectName}</h1>
          <p className="text-sm text-ink-500">Code Compliance Report</p>

          {/* Violation Summary */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
              <div className="text-2xl font-semibold text-danger-600 font-mono">
                {violationStats.major || 0}
              </div>
              <div className="text-xs text-ink-500 uppercase font-medium tracking-wide">Major</div>
            </div>
            <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
              <div className="text-2xl font-semibold text-yellow-700 font-mono">
                {violationStats.moderate || 0}
              </div>
              <div className="text-xs text-ink-500 uppercase font-medium tracking-wide">
                Moderate
              </div>
            </div>
            <div className="bg-white border border-line rounded-lg px-3 py-2.5 text-center">
              <div className="text-2xl font-semibold text-accent-600 font-mono">
                {violationStats.minor || 0}
              </div>
              <div className="text-xs text-ink-500 uppercase font-medium tracking-wide">Minor</div>
            </div>
          </div>

          {/* Export Button */}
          {data.violations.length > 0 && (
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

        {/* Violations List */}
        <ViolationListSidebar
          violations={data.violations}
          selectedViolation={selectedViolation}
          onViolationClick={handleViolationClick}
          currentPage={currentPage}
        />
      </div>

      {/* Main Content - PDF Viewer */}
      <div className="flex-1 overflow-hidden h-screen">
        <PDFViewer
          pdfUrl={data.pdfUrl}
          readOnly={true}
          violationMarkers={data.violations}
          onMarkerClick={handleViolationClick}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Violation Detail Modal */}
      {selectedViolation && (
        <ViolationDetailModal
          violation={selectedViolation}
          onClose={handleCloseModal}
          onNext={handleNextViolation}
          onPrev={handlePrevViolation}
          totalViolations={data.violations.length}
          currentIndex={data.violations.findIndex(v => v.checkId === selectedViolation.checkId) + 1}
        />
      )}
    </div>
  );
}

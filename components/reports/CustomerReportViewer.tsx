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

  // Group violations by severity for stats
  const violationStats = data.violations.reduce(
    (acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    },
    { major: 0, moderate: 0, minor: 0 } as Record<string, number>
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-50">
      {/* Left Sidebar - Always visible */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b bg-gray-50">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">{data.projectName}</h1>
          <p className="text-sm text-gray-600">Code Compliance Report</p>

          {/* Violation Summary */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
              <div className="text-2xl font-bold text-red-700">{violationStats.major || 0}</div>
              <div className="text-xs text-red-600 uppercase font-medium">Major</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-center">
              <div className="text-2xl font-bold text-yellow-700">
                {violationStats.moderate || 0}
              </div>
              <div className="text-xs text-yellow-600 uppercase font-medium">Moderate</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
              <div className="text-2xl font-bold text-blue-700">{violationStats.minor || 0}</div>
              <div className="text-xs text-blue-600 uppercase font-medium">Minor</div>
            </div>
          </div>
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

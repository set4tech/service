'use client';

import { useState, useCallback, useMemo } from 'react';
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
  const [sidebarView, setSidebarView] = useState<'violations' | 'building-info'>('violations');
  const [isNavHovered, setIsNavHovered] = useState(false);

  const handleNavClick = (view: 'violations' | 'building-info') => {
    setSidebarView(view);
    setIsNavHovered(false);
  };

  // Stable callback for page changes
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleViolationClick = useCallback((violation: ViolationMarker) => {
    setSelectedViolation(violation);
    setCurrentPage(violation.pageNumber);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedViolation(null);
  }, []);

  const handleNextViolation = useCallback(() => {
    if (!selectedViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === selectedViolation.checkId);
    const nextIndex = (currentIndex + 1) % data.violations.length;
    const nextViolation = data.violations[nextIndex];
    setSelectedViolation(nextViolation);
    setCurrentPage(nextViolation.pageNumber);
  }, [selectedViolation, data.violations]);

  const handlePrevViolation = useCallback(() => {
    if (!selectedViolation) return;
    const currentIndex = data.violations.findIndex(v => v.checkId === selectedViolation.checkId);
    const prevIndex = (currentIndex - 1 + data.violations.length) % data.violations.length;
    const prevViolation = data.violations[prevIndex];
    setSelectedViolation(prevViolation);
    setCurrentPage(prevViolation.pageNumber);
  }, [selectedViolation, data.violations]);

  const handleExportPDF = useCallback(async () => {
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
  }, [data.pdfUrl, data.violations, data.projectName, data.assessmentId]);

  // Group violations by severity for stats
  const violationStats = useMemo(() => {
    return data.violations.reduce(
      (acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      },
      { major: 0, moderate: 0, minor: 0 } as Record<string, number>
    );
  }, [data.violations]);

  // Helper to format building parameter values
  const formatParamValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object' && value.value !== undefined) {
      return formatParamValue(value.value);
    }
    return String(value);
  };

  // Extract building parameters into a flat list
  const buildingParams = useMemo(() => {
    if (!data.buildingParams) return [];

    const params: Array<{ label: string; value: string }> = [];
    const bp = data.buildingParams;

    // Project Identity
    if (bp.project_identity?.full_address) {
      params.push({ label: 'Address', value: formatParamValue(bp.project_identity.full_address) });
    }
    if (bp.project_identity?.authority_having_jurisdiction) {
      params.push({ label: 'Jurisdiction', value: formatParamValue(bp.project_identity.authority_having_jurisdiction) });
    }

    // Building Characteristics
    if (bp.building_characteristics?.occupancy_classification) {
      params.push({ label: 'Occupancy', value: formatParamValue(bp.building_characteristics.occupancy_classification) });
    }
    if (bp.building_characteristics?.number_of_stories) {
      params.push({ label: 'Stories', value: formatParamValue(bp.building_characteristics.number_of_stories) });
    }
    if (bp.building_characteristics?.has_parking !== undefined) {
      params.push({ label: 'Parking', value: formatParamValue(bp.building_characteristics.has_parking) });
    }
    if (bp.building_characteristics?.has_mezzanine !== undefined) {
      params.push({ label: 'Mezzanine', value: formatParamValue(bp.building_characteristics.has_mezzanine) });
    }
    if (bp.building_characteristics?.has_exterior_routes !== undefined) {
      params.push({ label: 'Exterior Routes', value: formatParamValue(bp.building_characteristics.has_exterior_routes) });
    }
    if (bp.building_characteristics?.elevator_exemption_applies !== undefined) {
      params.push({ label: 'Elevator Exemption', value: formatParamValue(bp.building_characteristics.elevator_exemption_applies) });
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
      params.push({ label: 'Public Accommodation', value: formatParamValue(bp.facility_type.is_public_accommodation) });
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
      params.push({ label: 'Federal Assistance', value: formatParamValue(bp.funding_sources.has_federal_assistance) });
    }

    return params;
  }, [data.buildingParams]);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-paper">
      {/* Left Sidebar - Always visible */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-line flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-line bg-white">
          <div className="flex items-start gap-3 mb-3">
            {/* Toggle Buttons */}
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => setSidebarView('violations')}
                className={`p-2 rounded-lg transition-colors ${
                  sidebarView === 'violations'
                    ? 'bg-danger-600 text-white'
                    : 'bg-gray-100 text-ink-600 hover:bg-gray-200'
                }`}
                title="View Violations"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView('building-info')}
                className={`p-2 rounded-lg transition-colors ${
                  sidebarView === 'building-info'
                    ? 'bg-accent-600 text-white'
                    : 'bg-gray-100 text-ink-600 hover:bg-gray-200'
                }`}
                title="Building Information"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </button>
            </div>

            <div>
              <h1 className="text-xl font-medium text-ink-900">{data.projectName}</h1>
              <p className="text-sm text-ink-500">Code Compliance Report</p>
            </div>
          </div>

          {/* Violation Summary - Only show when in violations view */}
          {sidebarView === 'violations' && (
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
            currentPage={currentPage}
          />
        ) : (
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
        )}
      </div>

      {/* Main Content - PDF Viewer */}
      <div className="flex-1 overflow-hidden h-screen">
        <PDFViewer
          pdfUrl={data.pdfUrl}
          readOnly={true}
          violationMarkers={data.violations}
          onMarkerClick={handleViolationClick}
          currentPage={currentPage}
          onPageChange={handlePageChange}
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

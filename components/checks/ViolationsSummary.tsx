'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ViolationListSidebar } from '@/components/reports/ViolationListSidebar';
import { ViolationMarker } from '@/lib/reports/get-violations';

// Dynamically load PDF viewer (client-side only)
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
  checks: any[];
  onCheckSelect: (checkId: string, sectionKey?: string) => void;
  onViolationSelect?: (violation: ViolationMarker | null) => void; // Notify parent of selected violation
  buildingInfo: BuildingInfo;
  codebooks: Codebook[];
  pdfUrl?: string;
  projectName?: string;
  assessmentId?: string;
  embedded?: boolean; // If true, only render sidebar (used in AssessmentClient)
}

export function ViolationsSummary({
  checks,
  onCheckSelect,
  onViolationSelect,
  buildingInfo: _buildingInfo,
  codebooks: _codebooks,
  pdfUrl,
  projectName,
  assessmentId,
  embedded = false,
}: Props) {
  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    new Set(['major', 'moderate', 'minor', 'needs_more_info'])
  );
  const [highlightedViolationId, setHighlightedViolationId] = useState<string | null>(null);

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
      c =>
        c.manual_override !== 'not_applicable' && c.manual_override !== 'insufficient_information'
    );
    const totalSections = applicableChecks.length;

    // Count assessed (has AI result OR manual override OR section overrides)
    const assessed = applicableChecks.filter(
      c =>
        c.latest_status ||
        (c.manual_override &&
          c.manual_override !== 'not_applicable' &&
          c.manual_override !== 'insufficient_information') ||
        c.has_section_overrides
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

  // Transform checks to violations
  const violations = useMemo(() => {
    const result: ViolationMarker[] = [];

    // Build list of all checks to process
    // Include all checks (both element and section) plus any cloned instances
    const allChecks: any[] = [];
    checks.forEach(check => {
      // Include the check itself
      allChecks.push(check);
      // Also add any cloned instances
      if (check.instances && Array.isArray(check.instances)) {
        allChecks.push(...check.instances);
      }
    });

    allChecks.forEach(check => {
      // Check for section-level overrides first (same logic as get-violations.ts)
      const checkSectionOverrides = check.section_overrides || [];
      if (checkSectionOverrides.length > 0) {
        // If ANY section override is non_compliant, include this check
        const hasNonCompliantSection = checkSectionOverrides.some(
          (override: any) => override.override_status === 'non_compliant'
        );
        if (!hasNonCompliantSection) {
          // If no non-compliant sections, skip this check
          return;
        }
        // Continue to create violation marker below
      } else {
        // No section overrides, use standard logic
        // Skip excluded/not applicable checks (MATCH get-violations.ts logic)
        if (
          check.manual_override === 'not_applicable' ||
          check.manual_override === 'excluded' ||
          check.manual_override === 'compliant'
        ) {
          return;
        }

        // For element checks, skip if element_sections is empty (all sections excluded)
        if (
          check.check_type === 'element' &&
          (!check.element_sections || check.element_sections.length === 0)
        ) {
          return;
        }

        // Determine if non-compliant or needs more info
        const isNonCompliant =
          check.manual_override === 'non_compliant' || check.latest_status === 'non_compliant';

        const needsMoreInfo =
          check.manual_override === 'needs_more_info' || check.latest_status === 'needs_more_info';

        if (!isNonCompliant && !needsMoreInfo) return;
      }

      // Parse violations from latest analysis
      let violationDetails: Array<{
        description: string;
        severity: 'minor' | 'moderate' | 'major';
      }> = [];
      let reasoning = '';
      let recommendations: string[] = [];
      let confidence = '';

      // Get data from check's latest analysis
      if (check.latest_analysis) {
        try {
          const analysis =
            typeof check.latest_analysis === 'string'
              ? JSON.parse(check.latest_analysis)
              : check.latest_analysis;

          if (analysis.violations && Array.isArray(analysis.violations)) {
            violationDetails = analysis.violations;
          }
          if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
            recommendations = analysis.recommendations;
          }
          reasoning = analysis.reasoning || check.latest_reasoning || '';
          confidence = analysis.confidence || check.latest_confidence || '';
        } catch (err) {
          console.error('Failed to parse analysis:', err);
        }
      }

      // If no violations in analysis, create generic one
      if (violationDetails.length === 0) {
        violationDetails = [
          {
            description: `Non-compliant with ${check.code_section_number || check.code_section_key}`,
            severity: 'moderate',
          },
        ];
      }

      // Create ONE violation marker per check (using first screenshot only)
      const screenshots = (check.screenshots || []).sort(
        (a: any, b: any) => a.page_number - b.page_number
      );
      if (screenshots.length > 0) {
        // Use only the first screenshot (earliest page)
        const screenshot = screenshots[0];
        const violationDetail = violationDetails[0];

        // Determine severity - use needs_more_info if that's the status, otherwise use violation detail
        const checkStatus = check.manual_override || check.latest_status;
        let severity: 'minor' | 'moderate' | 'major' | 'needs_more_info' = 'moderate';
        if (checkStatus === 'needs_more_info') {
          severity = 'needs_more_info';
        } else if (violationDetail?.severity) {
          severity = violationDetail.severity;
        }

        const description =
          violationDetail?.description ||
          (checkStatus === 'needs_more_info'
            ? `Additional information needed for ${check.code_section_number || check.code_section_key}`
            : `Non-compliant with ${check.code_section_number || check.code_section_key}`);

        if (screenshot.crop_coordinates && screenshot.page_number) {
          result.push({
            checkId: check.id,
            checkName: check.check_name || check.code_section_title || '',
            codeSectionKey: check.code_section_key || '',
            codeSectionNumber: check.code_section_number || check.code_section_key || '',
            pageNumber: screenshot.page_number,
            bounds: {
              x: screenshot.crop_coordinates.x,
              y: screenshot.crop_coordinates.y,
              width: screenshot.crop_coordinates.width,
              height: screenshot.crop_coordinates.height,
              zoom_level: screenshot.crop_coordinates.zoom_level || 1,
            },
            severity,
            description,
            screenshotUrl: screenshot.screenshot_url || '',
            thumbnailUrl: screenshot.thumbnail_url || '',
            screenshotId: screenshot.id,
            reasoning,
            recommendations,
            confidence,
            checkType: check.check_type,
            elementGroupName: check.element_group_name,
            instanceLabel: check.instance_label,
          });
        }
      } else {
        // No screenshots - create generic violation
        const violationDetail = violationDetails[0];

        // Determine severity - use needs_more_info if that's the status, otherwise use violation detail
        const checkStatus = check.manual_override || check.latest_status;
        let severity: 'minor' | 'moderate' | 'major' | 'needs_more_info' = 'moderate';
        if (checkStatus === 'needs_more_info') {
          severity = 'needs_more_info';
        } else if (violationDetail?.severity) {
          severity = violationDetail.severity;
        }

        const description =
          violationDetail?.description ||
          (checkStatus === 'needs_more_info'
            ? `Additional information needed for ${check.code_section_number || check.code_section_key}`
            : `Non-compliant with ${check.code_section_number || check.code_section_key}`);

        result.push({
          checkId: check.id,
          checkName: check.check_name || check.code_section_title || '',
          codeSectionKey: check.code_section_key || '',
          codeSectionNumber: check.code_section_number || check.code_section_key || '',
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 0, height: 0, zoom_level: 1 },
          severity,
          description,
          screenshotUrl: '',
          thumbnailUrl: '',
          screenshotId: '',
          reasoning,
          recommendations,
          confidence,
          checkType: check.check_type,
          elementGroupName: check.element_group_name,
          instanceLabel: check.instance_label,
        });
      }
    });

    return result;
  }, [checks]);

  const handleViolationClick = (violation: ViolationMarker) => {
    console.log('[ViolationsSummary] handleViolationClick:', violation);
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

  // Determine severity color
  const getSeverityIcon = () => {
    if (violations.length === 0) return '✅';
    if (violations.length >= 6) return '🚨';
    return '⚠️';
  };

  const getSeverityColor = () => {
    if (violations.length === 0) return 'text-green-700 bg-green-50 border-green-200';
    if (violations.length >= 6) return 'text-red-700 bg-red-50 border-red-200';
    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  };

  // If no PDF URL OR embedded mode, show sidebar-only view
  if (!pdfUrl || embedded) {
    return (
      <div className="flex flex-col h-full">
        {/* Compact Stats Header */}
        <div className="px-4 py-3 border-b bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">
              {violations.length} Violation{violations.length === 1 ? '' : 's'}
            </div>
            <div className="text-xs text-gray-500">
              {stats.assessed} / {stats.totalSections} assessed
            </div>
          </div>
        </div>

        {/* Violations List */}
        <ViolationListSidebar
          violations={violations}
          selectedViolation={selectedViolation}
          onViolationClick={handleViolationClick}
          currentPage={1}
          assessmentId={assessmentId}
          onSeverityFilterChange={setSeverityFilter}
        />
      </div>
    );
  }

  // Full view with PDF and sidebar
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-100">
      {/* Left Sidebar - Violations List */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen overflow-hidden">
        {/* Stats Header */}
        <div className="px-4 py-4 border-b bg-white space-y-3">
          <div className={`px-4 py-3 rounded-lg border ${getSeverityColor()}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getSeverityIcon()}</span>
              <div className="flex-1">
                <div className="font-semibold text-sm">
                  {violations.length === 0 ? (
                    'No Violations Found'
                  ) : (
                    <>
                      {violations.length} Violation{violations.length === 1 ? '' : 's'} Found
                    </>
                  )}
                </div>
                <div className="text-xs mt-1">
                  {stats.assessed} of {stats.totalSections} sections assessed ({stats.pct}%)
                </div>
              </div>
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

        {/* Violations List */}
        <ViolationListSidebar
          violations={violations}
          selectedViolation={selectedViolation}
          onViolationClick={handleViolationClick}
          currentPage={currentPage}
          assessmentId={assessmentId}
          onSeverityFilterChange={setSeverityFilter}
        />
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
    </div>
  );
}

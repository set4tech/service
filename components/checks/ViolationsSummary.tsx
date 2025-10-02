'use client';

import { useMemo, useState } from 'react';
import { ViolationListSidebar } from '@/components/reports/ViolationListSidebar';
import { ViolationMarker } from '@/lib/reports/get-violations';

interface Props {
  checks: any[];
  onCheckSelect: (checkId: string) => void;
}

export function ViolationsSummary({ checks, onCheckSelect }: Props) {
  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    // Exclude not_applicable from totals
    const applicableChecks = checks.filter(c => c.manual_override !== 'not_applicable');
    const totalSections = applicableChecks.length;

    // Count assessed (has AI result OR manual override)
    const assessed = applicableChecks.filter(
      c => c.latest_status || (c.manual_override && c.manual_override !== 'not_applicable')
    ).length;

    const pct = totalSections > 0 ? Math.round((assessed / totalSections) * 100) : 0;

    return { totalSections, assessed, pct };
  }, [checks]);

  // Transform checks to violations
  const violations = useMemo(() => {
    const result: ViolationMarker[] = [];

    checks.forEach(check => {
      // Determine if non-compliant
      const isNonCompliant =
        check.manual_override === 'non_compliant' || check.latest_status === 'non_compliant';

      if (!isNonCompliant) return;

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

      // Create violation marker for each screenshot
      const screenshots = check.screenshots || [];
      if (screenshots.length > 0) {
        screenshots.forEach((screenshot: any, idx: number) => {
          const violationDetail = violationDetails[idx] || violationDetails[0];

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
              severity: violationDetail.severity,
              description: violationDetail.description,
              screenshotUrl: screenshot.screenshot_url || '',
              thumbnailUrl: screenshot.thumbnail_url || '',
              screenshotId: screenshot.id,
              reasoning,
              recommendations,
              confidence,
            });
          }
        });
      } else {
        // No screenshots - create generic violation
        const violationDetail = violationDetails[0];
        result.push({
          checkId: check.id,
          checkName: check.check_name || check.code_section_title || '',
          codeSectionKey: check.code_section_key || '',
          codeSectionNumber: check.code_section_number || check.code_section_key || '',
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 0, height: 0, zoom_level: 1 },
          severity: violationDetail.severity,
          description: violationDetail.description,
          screenshotUrl: '',
          thumbnailUrl: '',
          screenshotId: '',
          reasoning,
          recommendations,
          confidence,
        });
      }
    });

    return result;
  }, [checks]);

  const handleViolationClick = (violation: ViolationMarker) => {
    setSelectedViolation(violation);
    onCheckSelect(violation.checkId);
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

  return (
    <div className="flex flex-col h-full">
      {/* Stats Header */}
      <div className="px-4 py-4 border-b bg-white">
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
      </div>

      {/* Violations List */}
      <ViolationListSidebar
        violations={violations}
        selectedViolation={selectedViolation}
        onViolationClick={handleViolationClick}
        currentPage={1}
      />
    </div>
  );
}

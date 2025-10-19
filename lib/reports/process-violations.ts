import { ViolationMarker, ViolationScreenshot } from './get-violations';

export interface CheckWithAnalysis {
  id: string;
  check_name?: string;
  code_section_key?: string;
  code_section_number?: string;
  code_section_title?: string;
  manual_override?: string | null;
  check_type?: string;
  element_group_id?: string;
  instance_label?: string;
  human_readable_title?: string;
  element_group_name?: string;
  section_overrides?: Array<{
    section_key: string;
    override_status: string;
  }>;
  latest_analysis_runs?: {
    compliance_status?: string;
    ai_reasoning?: string;
    confidence?: string;
    violations?: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }>;
    recommendations?: string[];
    raw_ai_response?: string;
  };
  latest_status?: string;
  latest_reasoning?: string;
  latest_confidence?: string;
  latest_analysis?: {
    violations?: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }>;
    recommendations?: string[];
  };
  screenshots?: Array<{
    id: string;
    screenshot_url: string;
    thumbnail_url: string;
    page_number: number;
    crop_coordinates?: {
      x: number;
      y: number;
      width: number;
      height: number;
      zoom_level?: number;
    };
  }>;
  element_groups?: {
    name: string;
  } | Array<{ name: string }>;
}

/**
 * Shared logic to process checks into violations for both customer report and summary view
 */
export function processChecksToViolations(checks: CheckWithAnalysis[]): ViolationMarker[] {
  const violations: ViolationMarker[] = [];

  for (const check of checks) {
    let shouldInclude = false;
    let decisionSource: 'manual' | 'section' | 'ai' | null = null;

    // PRIORITY 1: Check-level manual override (highest precedence)
    if (check.manual_override) {
      if (
        check.manual_override === 'non_compliant' ||
        check.manual_override === 'insufficient_information'
      ) {
        shouldInclude = true;
        decisionSource = 'manual';
      } else if (
        check.manual_override === 'compliant' ||
        check.manual_override === 'not_applicable'
      ) {
        shouldInclude = false;
        decisionSource = 'manual';
      }
    }

    // PRIORITY 2: Section-level overrides (only if no manual override)
    if (decisionSource === null) {
      const checkSectionOverrides = check.section_overrides || [];
      if (checkSectionOverrides.length > 0) {
        // If ANY section is non_compliant, include this check
        const hasNonCompliantSection = checkSectionOverrides.some(
          override => override.override_status === 'non_compliant'
        );
        if (hasNonCompliantSection) {
          shouldInclude = true;
          decisionSource = 'section';
        } else {
          // If all sections are compliant or not_applicable, exclude this check
          const allCompliantOrNA = checkSectionOverrides.every(
            override =>
              override.override_status === 'compliant' ||
              override.override_status === 'not_applicable'
          );
          if (allCompliantOrNA) {
            shouldInclude = false;
            decisionSource = 'section';
          }
          // If mixed or has other statuses, fall through to AI analysis
        }
      }
    }

    // PRIORITY 3: AI analysis (only if no manual override or section override decision)
    if (decisionSource === null) {
      const latestAnalysis = check.latest_analysis_runs;
      const aiStatus = check.latest_status || latestAnalysis?.compliance_status;

      if (
        aiStatus === 'non_compliant' ||
        aiStatus === 'needs_more_info' ||
        aiStatus === 'violation'
      ) {
        shouldInclude = true;
        decisionSource = 'ai';
      } else if (aiStatus === 'compliant' || aiStatus === 'not_applicable') {
        shouldInclude = false;
        decisionSource = 'ai';
      }
      // If no AI status, don't include (not assessed)
    }

    // Skip if we determined this should not be included
    if (!shouldInclude) {
      continue;
    }

    // Extract element group name from nested object
    const elementGroupName = Array.isArray(check.element_groups)
      ? check.element_groups[0]?.name
      : check.element_groups?.name || check.element_group_name || undefined;

    // Get screenshots and sort by page number
    const screenshots = (check.screenshots || []).sort(
      (a, b) => a.page_number - b.page_number
    );

    // Parse violations from AI response
    const violationDetails: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }> = [];
    let recommendations: string[] = [];
    let reasoning = '';
    let confidence = '';

    // Try to get from latest_analysis_runs first (database format)
    const latestAnalysis = check.latest_analysis_runs;
    if (latestAnalysis) {
      if (latestAnalysis.ai_reasoning) {
        reasoning = latestAnalysis.ai_reasoning;
      }
      if (latestAnalysis.confidence) {
        confidence = latestAnalysis.confidence;
      }
      if (latestAnalysis.violations && Array.isArray(latestAnalysis.violations)) {
        violationDetails.push(...latestAnalysis.violations);
      }
      if (latestAnalysis.recommendations && Array.isArray(latestAnalysis.recommendations)) {
        recommendations.push(...latestAnalysis.recommendations);
      }

      // Fallback: try parsing from raw_ai_response if violations column is empty
      if (violationDetails.length === 0 && latestAnalysis.raw_ai_response) {
        try {
          let aiResponse: any = latestAnalysis.raw_ai_response;

          if (typeof aiResponse === 'string') {
            // Strip markdown code fences if present
            let cleaned = aiResponse.trim();
            if (cleaned.startsWith('```json')) {
              cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            aiResponse = JSON.parse(cleaned);
          }

          if (aiResponse?.violations && Array.isArray(aiResponse.violations)) {
            violationDetails.push(...aiResponse.violations);
          }
          if (aiResponse?.recommendations && Array.isArray(aiResponse.recommendations)) {
            recommendations.push(...aiResponse.recommendations);
          }
        } catch (err) {
          console.error('[processChecksToViolations] Failed to parse AI response:', err);
        }
      }
    } else if (check.latest_analysis) {
      // Try to get from latest_analysis (client-side format)
      try {
        const analysis =
          typeof check.latest_analysis === 'string'
            ? JSON.parse(check.latest_analysis)
            : check.latest_analysis;

        if (analysis.violations && Array.isArray(analysis.violations)) {
          violationDetails.push(...analysis.violations);
        }
        if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
          recommendations.push(...analysis.recommendations);
        }
        reasoning = reasoning || check.latest_reasoning || '';
        confidence = confidence || check.latest_confidence || '';
      } catch (err) {
        console.error('[processChecksToViolations] Failed to parse analysis:', err);
      }
    }

    // Deduplicate recommendations
    recommendations = Array.from(new Set(recommendations));

    // Create ONE violation marker per check (but include ALL screenshots)
    if (screenshots.length > 0) {
      // Use first screenshot as primary
      const screenshot = screenshots[0];
      const violationDetail = violationDetails[0];

      // Determine severity - use needs_more_info if that's the status, otherwise use violation detail or default to moderate
      const checkStatus = check.manual_override || check.latest_status || latestAnalysis?.compliance_status;
      let severity: 'minor' | 'moderate' | 'major' | 'needs_more_info' = 'moderate';
      if (checkStatus === 'needs_more_info' || checkStatus === 'insufficient_information') {
        severity = 'needs_more_info';
      } else if (violationDetail?.severity) {
        severity = violationDetail.severity;
      }

      const description =
        violationDetail?.description ||
        (severity === 'needs_more_info'
          ? `Additional information needed for ${check.code_section_number || check.code_section_key}`
          : `Non-compliant with ${check.code_section_number || check.code_section_key}`);

      // Map all screenshots to ViolationScreenshot format
      const allScreenshots: ViolationScreenshot[] = screenshots
        .filter(s => s.crop_coordinates && s.page_number)
        .map(s => ({
          id: s.id,
          url: s.screenshot_url,
          thumbnailUrl: s.thumbnail_url,
          pageNumber: s.page_number,
          bounds: {
            x: s.crop_coordinates!.x,
            y: s.crop_coordinates!.y,
            width: s.crop_coordinates!.width,
            height: s.crop_coordinates!.height,
            zoom_level: s.crop_coordinates!.zoom_level || 1,
          },
        }));

      if (screenshot.crop_coordinates && screenshot.page_number && allScreenshots.length > 0) {
        violations.push({
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
          screenshotUrl: screenshot.screenshot_url,
          thumbnailUrl: screenshot.thumbnail_url,
          screenshotId: screenshot.id,
          allScreenshots,
          reasoning,
          recommendations,
          confidence,
          humanReadableTitle: check.human_readable_title,
          checkType: check.check_type as 'section' | 'element' | undefined,
          elementGroupName,
          instanceLabel: check.instance_label,
        });
      }
    } else {
      // No screenshots - create a generic marker
      const violationDetail = violationDetails[0];

      const checkStatus = check.manual_override || check.latest_status || latestAnalysis?.compliance_status;
      let severity: 'minor' | 'moderate' | 'major' | 'needs_more_info' = 'moderate';
      if (checkStatus === 'needs_more_info' || checkStatus === 'insufficient_information') {
        severity = 'needs_more_info';
      } else if (violationDetail?.severity) {
        severity = violationDetail.severity;
      }

      const description =
        violationDetail?.description ||
        (severity === 'needs_more_info'
          ? `Additional information needed for ${check.code_section_number || check.code_section_key}`
          : `Non-compliant with ${check.code_section_number || check.code_section_key}`);

      violations.push({
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
        allScreenshots: [],
        reasoning,
        recommendations,
        confidence,
        humanReadableTitle: check.human_readable_title,
        checkType: check.check_type as 'section' | 'element' | undefined,
        elementGroupName,
        instanceLabel: check.instance_label,
      });
    }
  }

  return violations;
}

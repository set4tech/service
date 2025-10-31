import { ViolationMarker, ViolationScreenshot } from './get-violations';

export interface CheckWithAnalysis {
  id: string;
  check_name?: string;
  code_section_key?: string;
  code_section_number?: string;
  code_section_title?: string;
  manual_status?: string | null;
  is_excluded?: boolean;
  check_type?: string; // Deprecated: computed from element_group_id
  element_group_id?: string;
  instance_label?: string;
  human_readable_title?: string;
  element_group_name?: string;
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
  element_groups?:
    | {
        name: string;
      }
    | Array<{ name: string }>;
}

export function processRpcRowsToViolations(rows: any[]): ViolationMarker[] {
  /* Get the list of violations from the RPC to show in the summary panels.
  This is only the highl evel stats, dont care about the details. */
  const violations: ViolationMarker[] = [];

  for (const check of rows) {
    const violationDetails: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major' | 'needs_more_info';
    }> = [];

    if (check.violations && Array.isArray(check.violations)) {
      violationDetails.push(...check.violations);
    }
    let recommendations: string[] = [];
    if (check.recommendations && Array.isArray(check.recommendations)) {
      recommendations.push(...check.recommendations);
    }
    recommendations = Array.from(new Set(recommendations));
    const screenshots = check.screenshots || [];
    const sortedScreenshots = screenshots.sort((a: any, b: any) => a.page_number - b.page_number);

    // Calculate severity before if/else so it's available in both branches
    const violationDetail = violationDetails[0];

    // Determine severity from violation details or status
    let severity: 'minor' | 'moderate' | 'major' | 'needs_more_info' = 'moderate';

    // First priority: Check if effective_status indicates needs_more_info
    if (
      check.effective_status === 'needs_more_info' ||
      check.effective_status === 'insufficient_information'
    ) {
      severity = 'needs_more_info';
    }
    // Second priority: Use severity from violation details if available
    else if (violationDetail?.severity) {
      severity = violationDetail.severity;
    }
    // Log when severity is not found to help debug
    else if (violationDetails.length > 0) {
      console.warn(
        `[processRpcRowsToViolations] Check ${check.check_id} has violations but no severity field:`,
        JSON.stringify(violationDetails[0]).substring(0, 100)
      );
    }

    // Calculate description once (used in both branches)
    const description =
      violationDetail?.description ||
      (severity === 'needs_more_info'
        ? `Additional information needed for ${check.code_section_number || check.code_section_key}`
        : `Non-compliant with ${check.code_section_number || check.code_section_key}`);

    if (sortedScreenshots.length > 0) {
      const screenshot = sortedScreenshots[0];

      const allScreenshots: ViolationScreenshot[] = sortedScreenshots
        .filter((s: any) => s.crop_coordinates && s.page_number)
        .map((s: any) => ({
          id: s.id,
          url: s.screenshot_url,
          thumbnailUrl: s.thumbnail_url,
          pageNumber: s.page_number,
          bounds: {
            x: s.crop_coordinates.x,
            y: s.crop_coordinates.y,
            width: s.crop_coordinates.width,
            height: s.crop_coordinates.height,
            zoom_level: s.crop_coordinates.zoom_level || 1,
          },
        }));

      if (screenshot.crop_coordinates && screenshot.page_number && allScreenshots.length > 0) {
        violations.push({
          checkId: check.check_id,
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
          screenshotId: screenshot.id || `${check.check_id}-primary`,
          allScreenshots,
          reasoning: check.ai_reasoning || '',
          manualReasoning: check.manual_status_note || undefined,
          recommendations,
          confidence: check.confidence?.toString() || '',
          humanReadableTitle: check.human_readable_title,
          checkType: (check.element_group_id ? 'element' : 'section') as
            | 'section'
            | 'element'
            | undefined,
          elementGroupName: check.element_group_name,
          instanceLabel: check.instance_label,
          sourceUrl: check.source_url || check.parent_source_url || '',
          sourceLabel: check.section_number ? `CBC ${check.section_number}` : '',
        });
      } else {
        // Screenshots exist but don't have valid crop_coordinates - treat as no-screenshot
        violations.push({
          checkId: check.check_id,
          checkName: check.check_name || check.code_section_title || '',
          codeSectionKey: check.code_section_key || '',
          codeSectionNumber: check.code_section_number || check.code_section_key || '',
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 0, height: 0, zoom_level: 1 },
          severity,
          description,
          screenshotUrl: '',
          thumbnailUrl: '',
          screenshotId: 'no-screenshot',
          allScreenshots: [],
          reasoning: check.ai_reasoning || '',
          manualReasoning: check.manual_status_note || undefined,
          recommendations,
          confidence: check.confidence?.toString() || '',
          humanReadableTitle: check.human_readable_title,
          checkType: (check.element_group_id ? 'element' : 'section') as
            | 'section'
            | 'element'
            | undefined,
          elementGroupName: check.element_group_name,
          instanceLabel: check.instance_label,
          sourceUrl: check.source_url || check.parent_source_url || '',
          sourceLabel: check.section_number ? `CBC ${check.section_number}` : '',
        });
      }
    } else {
      // No screenshots - create violation without screenshot data
      // Use 'no-screenshot' as screenshotId to ensure unique keys
      violations.push({
        checkId: check.check_id,
        checkName: check.check_name || check.code_section_title || '',
        codeSectionKey: check.code_section_key || '',
        codeSectionNumber: check.code_section_number || check.code_section_key || '',
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 0, height: 0, zoom_level: 1 },
        severity,
        description,
        screenshotUrl: '',
        thumbnailUrl: '',
        screenshotId: 'no-screenshot',
        allScreenshots: [],
        reasoning: check.ai_reasoning || '',
        manualReasoning: check.manual_status_note || undefined,
        recommendations,
        confidence: check.confidence?.toString() || '',
        humanReadableTitle: check.human_readable_title,
        checkType: check.check_type as 'section' | 'element' | undefined,
        elementGroupName: check.element_group_name,
        instanceLabel: check.instance_label,
        sourceUrl: check.source_url || check.parent_source_url || '',
        sourceLabel: check.section_number ? `CBC ${check.section_number}` : '',
      });
    }
  }

  return violations;
}

import { supabaseAdmin } from '@/lib/supabase-server';

export interface ViolationScreenshot {
  id: string;
  url: string;
  thumbnailUrl: string;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number };
}

export interface ViolationMarker {
  checkId: string;
  checkName: string;
  codeSectionKey: string;
  codeSectionNumber: string;
  pageNumber: number; // Page of the first/primary screenshot
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number }; // Bounds of first/primary screenshot
  severity: 'minor' | 'moderate' | 'major' | 'needs_more_info';
  description: string;
  screenshotUrl: string; // Primary/first screenshot URL (for backward compatibility)
  thumbnailUrl: string; // Primary/first screenshot thumbnail (for backward compatibility)
  screenshotId: string; // Primary/first screenshot ID (for backward compatibility)
  allScreenshots: ViolationScreenshot[]; // All screenshots for this violation, sorted by page number
  reasoning?: string;
  recommendations?: string[];
  confidence?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  humanReadableTitle?: string; // AI-generated natural language title (e.g., "Latchside clearance too small")
  checkType?: 'section' | 'element'; // Type of check
  elementGroupName?: string; // Element group name (e.g., "Doors", "Ramps")
  instanceLabel?: string; // Instance label (e.g., "Door 1", "Ramp 2")
}

export interface CodeInfo {
  id: string;
  title: string;
  version: string;
  sourceUrl?: string;
}

export interface ProjectViolationsData {
  projectId: string;
  projectName: string;
  assessmentId: string;
  pdfUrl: string;
  violations: ViolationMarker[];
  buildingParams?: any; // extracted_variables from projects table
  codeInfo?: CodeInfo;
}

/**
 * Fetches all violations for a project report view
 */
export async function getProjectViolations(
  projectId: string
): Promise<ProjectViolationsData | null> {
  const supabase = supabaseAdmin();

  // Get project info
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, pdf_url, unannotated_drawing_url, extracted_variables')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    console.error('[getProjectViolations] Failed to fetch project:', projectError);
    return null;
  }

  // Get the most recent assessment for this project
  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (assessmentError || !assessment) {
    console.error('[getProjectViolations] Failed to fetch assessment:', assessmentError);
    return null;
  }

  // Get all checks for this assessment with their latest analysis (single query)
  const { data: allChecks, error: checksError } = await supabase
    .from('checks')
    .select(
      `
      id,
      check_name,
      code_section_key,
      code_section_number,
      manual_override,
      human_readable_title,
      check_type,
      element_group_id,
      instance_label,
      element_groups(name),
      latest_analysis_runs(
        id,
        compliance_status,
        ai_reasoning,
        confidence,
        raw_ai_response,
        violations,
        recommendations,
        batch_group_id,
        total_batches
      )
    `
    )
    .eq('assessment_id', assessment.id);

  if (checksError) {
    console.error('[getProjectViolations] Failed to fetch checks:', checksError);
    return null;
  }

  // Fetch all section overrides for all checks
  const checkIds = (allChecks || []).map((c: any) => c.id);
  const { data: sectionOverrides } = await supabase
    .from('section_overrides')
    .select('check_id, section_key, section_number, override_status, note')
    .in('check_id', checkIds);

  // Create a map of check_id -> section overrides
  const sectionOverridesMap = new Map<string, any[]>();
  sectionOverrides?.forEach((override: any) => {
    if (!sectionOverridesMap.has(override.check_id)) {
      sectionOverridesMap.set(override.check_id, []);
    }
    sectionOverridesMap.get(override.check_id)!.push(override);
  });

  // All checks are flat section checks now
  const checksForViolations = allChecks || [];

  if (!checksForViolations || checksForViolations.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url, // Use pdf_url (the one used for screenshots in assessment page)
      violations: [],
      buildingParams: project.extracted_variables,
      codeInfo: undefined,
    };
  }

  // Fetch code info from the first check's section
  let codeInfo: CodeInfo | undefined;
  const firstCheck = checksForViolations.find((c: any) => c.code_section_key);
  if (firstCheck?.code_section_key) {
    const { data: sectionWithCode } = await supabase
      .from('sections')
      .select('code_id, codes(id, title, version, source_url)')
      .eq('key', firstCheck.code_section_key)
      .single();

    if (sectionWithCode?.codes) {
      const code = Array.isArray(sectionWithCode.codes)
        ? sectionWithCode.codes[0]
        : sectionWithCode.codes;
      codeInfo = {
        id: code.id,
        title: code.title,
        version: code.version,
        sourceUrl: code.source_url,
      };
    }
  }

  // Filter to non-compliant and needs_more_info checks
  const nonCompliantChecks = checksForViolations.filter((check: any) => {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    // FIRST: Check-level manual override takes highest precedence
    // If a user manually marks the entire check, that's the final decision
    if (check.manual_override) {
      // Exclude checks marked as compliant, not_applicable, or excluded
      if (
        check.manual_override === 'compliant' ||
        check.manual_override === 'not_applicable' ||
        check.manual_override === 'excluded'
      ) {
        return false;
      }

      // Include checks marked as non_compliant or insufficient_information
      if (
        check.manual_override === 'non_compliant' ||
        check.manual_override === 'insufficient_information'
      ) {
        return true;
      }
    }

    // SECOND: Check for section-level overrides
    const checkSectionOverrides = sectionOverridesMap.get(check.id) || [];
    if (checkSectionOverrides.length > 0) {
      // If ANY section override is non_compliant, include this check
      const hasNonCompliantSection = checkSectionOverrides.some(
        (override: any) => override.override_status === 'non_compliant'
      );
      if (hasNonCompliantSection) {
        return true;
      }

      // If all sections are compliant or not_applicable, exclude this check
      const allCompliantOrNA = checkSectionOverrides.every(
        (override: any) =>
          override.override_status === 'compliant' || override.override_status === 'not_applicable'
      );
      if (allCompliantOrNA) {
        return false;
      }
    }

    // THIRD: If no overrides, use AI analysis result
    const isNonCompliant = latestAnalysis?.compliance_status === 'non_compliant';
    const needsMoreInfo = latestAnalysis?.compliance_status === 'needs_more_info';

    return isNonCompliant || needsMoreInfo;
  });

  if (nonCompliantChecks.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url, // Use pdf_url (the one used for screenshots in assessment page)
      violations: [],
      buildingParams: project.extracted_variables,
      codeInfo,
    };
  }

  // Batch fetch sections for all unique keys (including parent info for URL fallback)
  const uniqueSectionKeys = Array.from(
    new Set(nonCompliantChecks.map((c: any) => c.code_section_key).filter(Boolean))
  );

  const { data: sectionsData } = await supabase
    .from('sections')
    .select('key, source_url, number, parent_key')
    .in('key', uniqueSectionKeys);

  const sectionsMap = new Map(sectionsData?.map(s => [s.key, s]) || []);

  // Batch fetch parent sections for URL fallback
  const parentKeys = Array.from(
    new Set(sectionsData?.map(s => s.parent_key).filter(Boolean) || [])
  );

  let parentSectionsMap = new Map();
  if (parentKeys.length > 0) {
    const { data: parentSections } = await supabase
      .from('sections')
      .select('key, source_url')
      .in('key', parentKeys);

    parentSectionsMap = new Map(parentSections?.map(p => [p.key, p]) || []);
  }

  // Batch fetch all screenshots for non-compliant checks
  const nonCompliantCheckIds = nonCompliantChecks.map((c: any) => c.id);

  // First get all screenshot assignments for these checks
  const { data: assignments, error: assignmentError } = await supabase
    .from('screenshot_check_assignments')
    .select('check_id, screenshot_id')
    .in('check_id', nonCompliantCheckIds);

  if (assignmentError) {
    console.error('[getProjectViolations] Assignment query error:', assignmentError);
  }

  // Get unique screenshot IDs
  const screenshotIds = Array.from(new Set(assignments?.map(a => a.screenshot_id) || []));

  // Fetch all screenshots in one query
  const { data: screenshots, error: screenshotError } = await supabase
    .from('screenshots')
    .select('id, screenshot_url, thumbnail_url, page_number, crop_coordinates')
    .in('id', screenshotIds);

  if (screenshotError) {
    console.error('[getProjectViolations] Screenshot query error:', screenshotError);
  }

  // Create a map of screenshot_id -> screenshot data
  const screenshotsMap = new Map(screenshots?.map(s => [s.id, s]) || []);

  // Group screenshots by check_id
  const screenshotsByCheck = new Map<string, any[]>();
  assignments?.forEach((assignment: any) => {
    const checkId = assignment.check_id;
    const screenshotId = assignment.screenshot_id;
    const screenshot = screenshotsMap.get(screenshotId);

    if (checkId && screenshot) {
      if (!screenshotsByCheck.has(checkId)) {
        screenshotsByCheck.set(checkId, []);
      }
      screenshotsByCheck.get(checkId)!.push({
        id: screenshot.id,
        screenshot_url: screenshot.screenshot_url,
        thumbnail_url: screenshot.thumbnail_url,
        page_number: screenshot.page_number,
        crop_coordinates: screenshot.crop_coordinates,
      });
    }
  });

  // Build violations from non-compliant checks
  const violations: ViolationMarker[] = [];

  // Fetch PDF page dimensions to validate coordinates (currently unused, reserved for future validation)
  const _pdfDimensions = new Map<number, { width: number; height: number }>();

  // We'll validate coordinates against reasonable bounds
  // Typical architectural drawings are 6000-8000px wide at natural scale (currently unused, reserved for future validation)
  const _MAX_REASONABLE_DIMENSION = 12000; // pixels

  // Fetch all analysis runs for batched checks
  const batchGroupIds = new Set<string>();
  const checksWithBatches = new Map<string, any[]>();

  for (const check of nonCompliantChecks) {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    if (latestAnalysis?.batch_group_id && latestAnalysis?.total_batches > 1) {
      batchGroupIds.add(latestAnalysis.batch_group_id);
    }
  }

  // Fetch all runs for batched checks
  if (batchGroupIds.size > 0) {
    const { data: batchedRuns } = await supabase
      .from('analysis_runs')
      .select(
        'id, check_id, batch_group_id, compliance_status, ai_reasoning, confidence, raw_ai_response, violations, recommendations'
      )
      .in('batch_group_id', Array.from(batchGroupIds));

    // Group by check_id
    batchedRuns?.forEach((run: any) => {
      if (!checksWithBatches.has(run.check_id)) {
        checksWithBatches.set(run.check_id, []);
      }
      checksWithBatches.get(run.check_id)!.push(run);
    });
  }

  for (const check of nonCompliantChecks) {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    // Extract element group name from nested object (Supabase returns as array or single object)
    const elementGroupName = Array.isArray((check as any).element_groups)
      ? (check as any).element_groups[0]?.name
      : (check as any).element_groups?.name || null;

    // Get source URL from pre-fetched sections (with parent fallback)
    const section = sectionsMap.get(check.code_section_key);
    let sourceUrl = section?.source_url || '';

    // Fallback to parent section's source_url if child doesn't have one
    if (!sourceUrl && section?.parent_key) {
      const parentSection = parentSectionsMap.get(section.parent_key);
      sourceUrl = parentSection?.source_url || '';
    }

    const sourceLabel = section?.number ? `CBC ${section.number}` : '';

    // Get screenshots from pre-fetched map and sort by page number
    const screenshots = (screenshotsByCheck.get(check.id) || []).sort(
      (a, b) => a.page_number - b.page_number
    );

    // Parse violations from AI response - aggregate from all batches if applicable
    const violationDetails: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }> = [];
    let recommendations: string[] = [];
    let reasoning = '';
    let confidence = '';

    // Check if this is a batched analysis
    const batchedRuns = checksWithBatches.get(check.id);
    const analysisRuns = batchedRuns && batchedRuns.length > 0 ? batchedRuns : [latestAnalysis];

    // Aggregate violations and recommendations from all runs
    for (const analysis of analysisRuns) {
      if (!analysis) continue;

      // Take reasoning and confidence from the first run
      if (!reasoning && analysis.ai_reasoning) {
        reasoning = analysis.ai_reasoning;
      }
      if (!confidence && analysis.confidence) {
        confidence = analysis.confidence;
      }

      // Use violations from the dedicated column (parsed during analysis)
      if (analysis.violations && Array.isArray(analysis.violations)) {
        violationDetails.push(...analysis.violations);
      }

      if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
        recommendations.push(...analysis.recommendations);
      }

      // Fallback: try parsing from raw_ai_response if violations column is empty
      if (analysis.violations?.length === 0 || !analysis.violations) {
        try {
          let aiResponse = analysis.raw_ai_response;

          if (typeof aiResponse === 'string') {
            // Strip markdown code fences if present (```json ... ```)
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
          console.error('[getProjectViolations] Failed to parse AI response:', err);
        }
      }
    }

    // Deduplicate recommendations
    recommendations = Array.from(new Set(recommendations));

    // Create ONE violation marker per check (but include ALL screenshots)
    if (screenshots && screenshots.length > 0) {
      // Use first screenshot as primary
      const screenshot = screenshots[0];
      const violationDetail = violationDetails[0];

      // Determine severity - use needs_more_info if that's the status, otherwise use violation detail or default to moderate
      const checkStatus = check.manual_override || latestAnalysis?.compliance_status;
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

      // Map all screenshots to ViolationScreenshot format
      const allScreenshots: ViolationScreenshot[] = screenshots
        .filter(s => s.crop_coordinates && s.page_number) // Only include valid screenshots
        .map(s => ({
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
          checkId: check.id,
          checkName: check.check_name,
          codeSectionKey: check.code_section_key,
          codeSectionNumber: check.code_section_number || check.code_section_key,
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
          allScreenshots, // Include all screenshots
          reasoning,
          recommendations,
          confidence,
          sourceUrl,
          sourceLabel,
          humanReadableTitle: check.human_readable_title,
          checkType: check.check_type,
          elementGroupName,
          instanceLabel: check.instance_label,
        });
      }
    } else {
      // No screenshots - create a generic marker (we'll handle this case in the UI)
      const violationDetail = violationDetails[0];

      // Determine severity - use needs_more_info if that's the status, otherwise use violation detail or default to moderate
      const checkStatus = check.manual_override || latestAnalysis?.compliance_status;
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

      violations.push({
        checkId: check.id,
        checkName: check.check_name,
        codeSectionKey: check.code_section_key,
        codeSectionNumber: check.code_section_number || check.code_section_key,
        pageNumber: 1, // Default to first page if no screenshot
        bounds: { x: 0, y: 0, width: 0, height: 0, zoom_level: 1 },
        severity,
        description,
        screenshotUrl: '',
        thumbnailUrl: '',
        screenshotId: '',
        allScreenshots: [], // Empty array when no screenshots
        reasoning,
        recommendations,
        confidence,
        sourceUrl,
        sourceLabel,
        humanReadableTitle: check.human_readable_title,
        checkType: check.check_type,
        elementGroupName,
        instanceLabel: check.instance_label,
      });
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    assessmentId: assessment.id,
    pdfUrl: project.pdf_url, // Use pdf_url (the one used for screenshots in assessment page)
    violations,
    buildingParams: project.extracted_variables,
    codeInfo,
  };
}

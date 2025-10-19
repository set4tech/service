import { supabaseAdmin } from '@/lib/supabase-server';
import { processChecksToViolations } from './process-violations';

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
      manual_status,
      is_excluded,
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

  // Batch fetch all screenshots for all checks (in batches to avoid query size limits)
  const allCheckIds = checksForViolations.map((c: any) => c.id);
  let assignments: any[] = [];

  // Process in batches of 1000 to avoid Supabase query limits
  const batchSize = 1000;
  for (let i = 0; i < allCheckIds.length; i += batchSize) {
    const batch = allCheckIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('screenshot_check_assignments')
      .select('check_id, screenshot_id')
      .in('check_id', batch);

    if (error) {
      console.error('[getProjectViolations] Assignment query error:', error);
    } else if (data) {
      assignments.push(...data);
    }
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

  // Batch fetch sections for source URLs
  const uniqueSectionKeys = Array.from(
    new Set(checksForViolations.map((c: any) => c.code_section_key).filter(Boolean))
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

  // Attach screenshots to checks for shared processing
  const checksWithScreenshots = checksForViolations.map((check: any) => {
    const checkScreenshots = screenshotsByCheck.get(check.id) || [];
    return {
      ...check,
      screenshots: checkScreenshots,
    };
  });

  // Use shared violation processing logic
  const violations = processChecksToViolations(checksWithScreenshots);

  // Add source URLs to violations
  violations.forEach(violation => {
    const section = sectionsMap.get(violation.codeSectionKey);
    let sourceUrl = section?.source_url || '';

    // Fallback to parent section's source_url if child doesn't have one
    if (!sourceUrl && section?.parent_key) {
      const parentSection = parentSectionsMap.get(section.parent_key);
      sourceUrl = parentSection?.source_url || '';
    }

    const sourceLabel = section?.number ? `CBC ${section.number}` : '';

    violation.sourceUrl = sourceUrl;
    violation.sourceLabel = sourceLabel;
  });

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

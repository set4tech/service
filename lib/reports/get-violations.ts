import { supabaseAdmin } from '@/lib/supabase-server';

export interface ViolationMarker {
  checkId: string;
  checkName: string;
  codeSectionKey: string;
  codeSectionNumber: string;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number };
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  screenshotUrl: string;
  thumbnailUrl: string;
  screenshotId: string;
  reasoning?: string;
  recommendations?: string[];
  confidence?: string;
  sourceUrl?: string;
  sourceLabel?: string;
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
    console.error('Failed to fetch project:', projectError);
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
    console.error('Failed to fetch assessment:', assessmentError);
    return null;
  }

  // Get all checks for this assessment with their latest analysis (batch query)
  const { data: allChecks, error: checksError } = await supabase
    .from('checks')
    .select(
      `
      id,
      check_name,
      code_section_key,
      code_section_number,
      manual_override,
      latest_analysis_runs(
        compliance_status,
        ai_reasoning,
        confidence,
        raw_ai_response
      )
    `
    )
    .eq('assessment_id', assessment.id);

  if (checksError) {
    console.error('Failed to fetch checks:', checksError);
    return null;
  }

  if (!allChecks || allChecks.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url, // Use same PDF that screenshots were captured from
      violations: [],
      buildingParams: project.extracted_variables,
      codeInfo: undefined,
    };
  }

  // Fetch code info from the first check's section
  let codeInfo: CodeInfo | undefined;
  const firstCheck = allChecks.find((c: any) => c.code_section_key);
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

  // Filter to only non-compliant checks
  console.log('[getProjectViolations] Total checks:', allChecks?.length);
  const nonCompliantChecks = allChecks.filter((check: any) => {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    const isNonCompliant =
      check.manual_override === 'non_compliant' ||
      latestAnalysis?.compliance_status === 'non_compliant';

    if (isNonCompliant) {
      console.log('[getProjectViolations] Non-compliant check found:', {
        checkId: check.id,
        checkName: check.check_name,
        manual_override: check.manual_override,
        analysisStatus: latestAnalysis?.compliance_status,
      });
    }

    return isNonCompliant;
  });

  console.log('[getProjectViolations] Non-compliant checks count:', nonCompliantChecks.length);

  if (nonCompliantChecks.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url, // Use same PDF that screenshots were captured from
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
  const checkIds = nonCompliantChecks.map((c: any) => c.id);

  // First get all screenshot assignments for these checks
  const { data: assignments, error: assignmentError } = await supabase
    .from('screenshot_check_assignments')
    .select('check_id, screenshot_id')
    .in('check_id', checkIds);

  if (assignmentError) {
    console.error('[getProjectViolations] Assignment query error:', assignmentError);
  }

  console.log('[getProjectViolations] Screenshot assignments fetched:', assignments?.length);

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

  console.log('[getProjectViolations] Screenshots fetched:', screenshots?.length);

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

  for (const check of nonCompliantChecks) {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    // Get source URL from pre-fetched sections (with parent fallback)
    const section = sectionsMap.get(check.code_section_key);
    let sourceUrl = section?.source_url || '';

    // Fallback to parent section's source_url if child doesn't have one
    if (!sourceUrl && section?.parent_key) {
      const parentSection = parentSectionsMap.get(section.parent_key);
      sourceUrl = parentSection?.source_url || '';
    }

    const sourceLabel = section?.number ? `CBC ${section.number}` : '';

    // Get screenshots from pre-fetched map
    const screenshots = screenshotsByCheck.get(check.id) || [];
    console.log('[getProjectViolations] Check screenshots:', {
      checkId: check.id,
      screenshotCount: screenshots.length,
    });

    // Parse violations from AI response
    let violationDetails: Array<{
      description: string;
      severity: 'minor' | 'moderate' | 'major';
    }> = [];
    let recommendations: string[] = [];
    let reasoning = '';
    let confidence = '';

    if (latestAnalysis) {
      reasoning = latestAnalysis.ai_reasoning || '';
      confidence = latestAnalysis.confidence || '';

      try {
        let aiResponse = latestAnalysis.raw_ai_response;

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
          violationDetails = aiResponse.violations;
        }

        if (aiResponse?.recommendations && Array.isArray(aiResponse.recommendations)) {
          recommendations = aiResponse.recommendations;
        }
      } catch (err) {
        console.error('Failed to parse AI response:', err);
      }
    }

    // Create a violation marker for each screenshot
    if (screenshots && screenshots.length > 0) {
      console.log('[getProjectViolations] Creating violations from screenshots');
      screenshots.forEach((screenshot, idx) => {
        // Get violation details for this screenshot (use first violation if multiple, or generic)
        const violationDetail = violationDetails[idx] || violationDetails[0];
        const description =
          violationDetail?.description ||
          `Non-compliant with ${check.code_section_number || check.code_section_key}`;
        const severity = violationDetail?.severity || 'moderate';

        if (screenshot.crop_coordinates && screenshot.page_number) {
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
            reasoning,
            recommendations,
            confidence,
            sourceUrl,
            sourceLabel,
          });
        }
      });
    } else {
      // No screenshots - create a generic marker (we'll handle this case in the UI)
      console.log('[getProjectViolations] No screenshots, creating generic violation marker');
      const violationDetail = violationDetails[0];
      const description =
        violationDetail?.description ||
        `Non-compliant with ${check.code_section_number || check.code_section_key}`;
      const severity = violationDetail?.severity || 'moderate';

      console.log('[getProjectViolations] Generic violation:', {
        checkId: check.id,
        description,
        severity,
      });

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
        reasoning,
        recommendations,
        confidence,
        sourceUrl,
        sourceLabel,
      });
    }
  }

  console.log('[getProjectViolations] Project:', projectId);
  console.log('[getProjectViolations] Total violations found:', violations.length);
  console.log('[getProjectViolations] Violations:', JSON.stringify(violations, null, 2));

  return {
    projectId: project.id,
    projectName: project.name,
    assessmentId: assessment.id,
    pdfUrl: project.pdf_url, // Use same PDF that screenshots were captured from
    violations,
    buildingParams: project.extracted_variables,
    codeInfo,
  };
}

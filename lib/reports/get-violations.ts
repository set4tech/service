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

export interface ProjectViolationsData {
  projectId: string;
  projectName: string;
  assessmentId: string;
  pdfUrl: string;
  violations: ViolationMarker[];
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
    .select('id, name, pdf_url')
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
      pdfUrl: project.pdf_url,
      violations: [],
    };
  }

  // Filter to only non-compliant checks
  const nonCompliantChecks = allChecks.filter((check: any) => {
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    return (
      check.manual_override === 'non_compliant' ||
      latestAnalysis?.compliance_status === 'non_compliant'
    );
  });

  if (nonCompliantChecks.length === 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url,
      violations: [],
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
  const { data: allScreenshots } = await supabase
    .from('screenshots')
    .select(
      `
      id,
      screenshot_url,
      thumbnail_url,
      page_number,
      crop_coordinates,
      screenshot_check_assignments!inner(check_id)
    `
    )
    .in('screenshot_check_assignments.check_id', checkIds)
    .order('created_at', { ascending: true });

  // Group screenshots by check_id
  const screenshotsByCheck = new Map<string, any[]>();
  allScreenshots?.forEach((s: any) => {
    const checkId = s.screenshot_check_assignments?.check_id;
    if (checkId) {
      if (!screenshotsByCheck.has(checkId)) {
        screenshotsByCheck.set(checkId, []);
      }
      screenshotsByCheck.get(checkId)!.push({
        id: s.id,
        screenshot_url: s.screenshot_url,
        thumbnail_url: s.thumbnail_url,
        page_number: s.page_number,
        crop_coordinates: s.crop_coordinates,
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
      const violationDetail = violationDetails[0];
      const description =
        violationDetail?.description ||
        `Non-compliant with ${check.code_section_number || check.code_section_key}`;
      const severity = violationDetail?.severity || 'moderate';

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

  return {
    projectId: project.id,
    projectName: project.name,
    assessmentId: assessment.id,
    pdfUrl: project.pdf_url,
    violations,
  };
}

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

  // Get all checks for this assessment
  const { data: allChecks, error: checksError } = await supabase
    .from('checks')
    .select(
      `
      id,
      check_name,
      code_section_key,
      code_section_number,
      manual_override
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

  // For each check, get latest analysis to determine if it's non-compliant
  const violations: ViolationMarker[] = [];

  for (const check of allChecks) {
    // Get latest analysis run for this check
    const { data: analysisRuns } = await supabase
      .from('analysis_runs')
      .select('compliance_status, ai_reasoning, ai_confidence, raw_ai_response')
      .eq('check_id', check.id)
      .order('executed_at', { ascending: false })
      .limit(1);

    const latestAnalysis = analysisRuns?.[0];

    // Skip if not non-compliant (either by manual override or AI analysis)
    const isNonCompliant =
      check.manual_override === 'non_compliant' ||
      latestAnalysis?.compliance_status === 'non_compliant';

    if (!isNonCompliant) {
      continue;
    }

    // Get screenshots
    const { data: screenshotData } = await supabase
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
      .eq('screenshot_check_assignments.check_id', check.id)
      .order('created_at', { ascending: true });

    const screenshots = screenshotData?.map((s: any) => ({
      id: s.id,
      screenshot_url: s.screenshot_url,
      thumbnail_url: s.thumbnail_url,
      page_number: s.page_number,
      crop_coordinates: s.crop_coordinates,
    }));

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
      confidence = latestAnalysis.ai_confidence || '';

      try {
        const aiResponse =
          typeof latestAnalysis.raw_ai_response === 'string'
            ? JSON.parse(latestAnalysis.raw_ai_response)
            : latestAnalysis.raw_ai_response;

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

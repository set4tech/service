import { supabaseAdmin } from '@/lib/supabase-server';
import { normalizeVariables } from '@/lib/variables';
import AssessmentClient from './ui/AssessmentClient';

// Force dynamic rendering - don't use static cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const [{ data: assessment }, { data: allChecks }] = await Promise.all([
    supabase
      .from('assessments')
      .select('*, projects(pdf_url, selected_code_ids, extracted_variables)')
      .eq('id', id)
      .single(),
    supabase
      .from('checks')
      .select('*, element_groups(name, slug), sections!code_section_key(never_relevant)')
      .eq('assessment_id', id)
      .order('code_section_number', { ascending: true }),
  ]);

  // Filter out checks for sections marked as never_relevant
  // Exception: Don't filter element checks since they cover multiple sections
  const filteredChecks = (allChecks || []).filter((check: any) => {
    if (check.check_type === 'element') return true;
    return check.sections?.never_relevant !== true;
  });

  if (filteredChecks.length < (allChecks?.length || 0)) {
    console.log(
      '[Server] Filtered out',
      (allChecks?.length || 0) - filteredChecks.length,
      'never_relevant checks'
    );
  }

  // Fetch latest analysis and screenshots for filtered checks
  const checkIds = filteredChecks.map(c => c.id);

  // Fetch analysis
  const { data: latestAnalysis } =
    checkIds.length > 0
      ? await supabase
          .from('latest_analysis_runs')
          .select(
            'check_id, compliance_status, confidence, ai_reasoning, violations, recommendations'
          )
          .in('check_id', checkIds)
      : { data: [] };

  // Fetch screenshots - use alternative approach via join to avoid large IN clause
  let allScreenshots: any[] = [];
  let screenshotsError = null;

  if (checkIds.length > 0) {
    try {
      // Fetch all screenshots for this assessment via junction table (avoids large IN clause)
      const result = await supabase
        .from('screenshots')
        .select(
          `
          *,
          screenshot_check_assignments!inner(
            check_id,
            is_original,
            checks!inner(assessment_id)
          )
        `
        )
        .eq('screenshot_check_assignments.checks.assessment_id', id)
        .order('created_at');

      // Flatten the nested structure
      allScreenshots = (result.data || []).map((item: any) => ({
        ...item,
        check_id: item.screenshot_check_assignments?.[0]?.check_id,
        is_original: item.screenshot_check_assignments?.[0]?.is_original,
        screenshot_check_assignments: undefined, // Remove nested structure
      }));
      screenshotsError = result.error;
      console.warn(
        `[Server] Screenshots query returned: ${allScreenshots.length} rows, error: ${screenshotsError ? 'YES' : 'NO'}`
      );
    } catch (err) {
      console.error('[AssessmentPage] Screenshots fetch exception:', err);
      screenshotsError = err;
    }
  }

  if (screenshotsError) {
    console.error('[AssessmentPage] Screenshots fetch error:', screenshotsError);
  }

  // Debug log - server side (will show in Vercel logs)
  if (allScreenshots && allScreenshots.length > 0) {
    console.warn(`[Server] Loaded ${allScreenshots.length} screenshots for assessment ${id}`);
  } else {
    console.warn(
      `[Server] NO screenshots loaded for assessment ${id}. CheckIds count: ${checkIds.length}`
    );
  }

  // Create a map of check_id -> latest analysis
  const analysisMap = new Map((latestAnalysis || []).map(a => [a.check_id, a]));

  // Create a map of check_id -> screenshots
  const screenshotsMap = new Map<string, any[]>();
  (allScreenshots || []).forEach((screenshot: any) => {
    if (!screenshotsMap.has(screenshot.check_id)) {
      screenshotsMap.set(screenshot.check_id, []);
    }
    screenshotsMap.get(screenshot.check_id)!.push(screenshot);
  });

  // Group checks by parent - instances will be nested under their parent
  const checks = filteredChecks.reduce((acc: any[], check: any) => {
    if (!check.parent_check_id) {
      // This is a parent check - find all its instances
      const rawInstances = filteredChecks.filter((c: any) => c.parent_check_id === check.id);

      // Add analysis data and screenshots to instances
      const instances = rawInstances.map((instance: any) => {
        const instanceAnalysis = analysisMap.get(instance.id);
        const instanceScreenshots = screenshotsMap.get(instance.id) || [];
        return {
          ...instance,
          latest_status: instanceAnalysis?.compliance_status || null,
          latest_confidence: instanceAnalysis?.confidence || null,
          latest_reasoning: instanceAnalysis?.ai_reasoning || null,
          latest_analysis: instanceAnalysis?.violations
            ? {
                violations: instanceAnalysis.violations,
                recommendations: instanceAnalysis.recommendations,
              }
            : null,
          screenshots: instanceScreenshots,
        };
      });

      // Flatten element_groups join
      const elementGroup = check.element_groups;

      // Add latest analysis data and screenshots
      const analysis = analysisMap.get(check.id);
      const checkScreenshots = screenshotsMap.get(check.id) || [];

      acc.push({
        ...check,
        element_group_name: elementGroup?.name || null,
        element_group_slug: elementGroup?.slug || null,
        element_groups: undefined, // Remove nested object
        latest_status: analysis?.compliance_status || null,
        latest_confidence: analysis?.confidence || null,
        latest_reasoning: analysis?.ai_reasoning || null,
        latest_analysis: analysis?.violations
          ? {
              violations: analysis.violations,
              recommendations: analysis.recommendations,
            }
          : null,
        screenshots: checkScreenshots,
        instances,
        instance_count: instances.length,
      });
    }
    return acc;
  }, []);

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
  }

  // Fetch codebook details for selected codes
  const selectedCodeIds = (assessment.projects as any)?.selected_code_ids || [];
  const { data: codes } = await supabase
    .from('codes')
    .select('id, title')
    .in('id', selectedCodeIds);

  const codebooks = codes?.map(c => ({ id: c.id, name: c.title })) || [];

  // Extract and normalize building parameters
  const extractedVars = (assessment.projects as any)?.extracted_variables || {};
  const normalizedVars = normalizeVariables(extractedVars);
  const buildingInfo = {
    occupancy: normalizedVars.occupancy_letter || 'Unknown',
    size_sf: normalizedVars.building_size_sf,
    stories: normalizedVars.number_of_stories,
    work_type: normalizedVars.work_type || 'Unknown',
    has_parking: normalizedVars.has_parking,
    facility_category: normalizedVars.facility_category || 'Unknown',
  };

  // Get PDF URL from the related project
  const assessmentWithPdf = {
    ...assessment,
    pdf_url: assessment.projects?.pdf_url || null,
  };

  // Progress: completed checks over total checks
  const totalChecks = checks?.length || 0;
  const completed = (checks || []).filter(c => c.latest_status || c.status === 'completed').length;
  const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;

  return (
    <AssessmentClient
      assessment={assessmentWithPdf}
      checks={checks || []}
      progress={{ totalChecks, completed, pct }}
      buildingInfo={buildingInfo}
      codebooks={codebooks}
    />
  );
}

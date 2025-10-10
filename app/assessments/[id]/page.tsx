import { supabaseAdmin } from '@/lib/supabase-server';
import { normalizeVariables } from '@/lib/variables';
import AssessmentClient from './ui/AssessmentClient';

// Force dynamic rendering - don't use static cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const startTime = Date.now();
  const [{ data: assessment }, { data: allChecks, error: checksError }] = await Promise.all([
    supabase
      .from('assessments')
      .select('*, projects(name, pdf_url, selected_code_ids, extracted_variables)')
      .eq('id', id)
      .single(),
    supabase
      .from('checks')
      .select('*, element_groups(name, slug), sections!code_section_key(never_relevant)')
      .eq('assessment_id', id)
      .limit(5000), // Increase limit to handle large assessments
  ]);
  console.log(`[Perf] Assessment + checks query: ${Date.now() - startTime}ms`);

  if (checksError) {
    console.error('[Server] ERROR fetching checks:', checksError);
  }

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

  // Fetch analysis and section overrides
  const t1 = Date.now();
  const [{ data: latestAnalysis }, { data: sectionOverrides }] =
    checkIds.length > 0
      ? await Promise.all([
          supabase
            .from('latest_analysis_runs')
            .select(
              'check_id, compliance_status, confidence, ai_reasoning, violations, recommendations'
            )
            .in('check_id', checkIds),
          supabase
            .from('section_overrides')
            .select('check_id, section_key, override_status')
            .in('check_id', checkIds),
        ])
      : [{ data: [] }, { data: [] }];
  console.log(`[Perf] Latest analysis query: ${Date.now() - t1}ms`);

  // Fetch screenshots - use alternative approach via join to avoid large IN clause
  let allScreenshots: any[] = [];
  let screenshotsError = null;

  if (checkIds.length > 0) {
    try {
      // Fetch all screenshots for this assessment via junction table (avoids large IN clause)
      const t2 = Date.now();
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
      console.log(`[Perf] Screenshots query: ${Date.now() - t2}ms`);

      // Flatten the nested structure
      const t3 = Date.now();
      allScreenshots = (result.data || []).map((item: any) => ({
        ...item,
        check_id: item.screenshot_check_assignments?.[0]?.check_id,
        is_original: item.screenshot_check_assignments?.[0]?.is_original,
        screenshot_check_assignments: undefined, // Remove nested structure
      }));
      console.log(`[Perf] Screenshots flatten: ${Date.now() - t3}ms`);
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

  // Create a map of check_id -> section overrides
  const sectionOverridesMap = new Map<string, any[]>();
  (sectionOverrides || []).forEach((override: any) => {
    if (!sectionOverridesMap.has(override.check_id)) {
      sectionOverridesMap.set(override.check_id, []);
    }
    sectionOverridesMap.get(override.check_id)!.push(override);
  });

  // Create a map of check_id -> screenshots
  const screenshotsMap = new Map<string, any[]>();
  (allScreenshots || []).forEach((screenshot: any) => {
    if (!screenshotsMap.has(screenshot.check_id)) {
      screenshotsMap.set(screenshot.check_id, []);
    }
    screenshotsMap.get(screenshot.check_id)!.push(screenshot);
  });

  // Group checks by parent - instances will be nested under their parent
  const t4 = Date.now();
  const checks = filteredChecks.reduce((acc: any[], check: any) => {
    // Skip element templates (instance_number === 0)
    if (check.check_type === 'element' && check.instance_number === 0) {
      return acc;
    }

    // Skip section checks that belong to element parents (they're accessed via parent)
    if (check.check_type === 'section' && check.parent_check_id) {
      const parent = filteredChecks.find((c: any) => c.id === check.parent_check_id);
      if (parent?.check_type === 'element') {
        return acc;
      }
    }

    // For element checks, always treat as top-level (ignore parent_check_id from old cloning system)
    const isTopLevel = check.check_type === 'element' || !check.parent_check_id;

    if (isTopLevel) {
      // This is a parent check - find all its instances
      // For element checks: find child section checks
      // For section checks: find cloned instances
      const rawInstances =
        check.check_type === 'element'
          ? filteredChecks.filter(
              (c: any) => c.parent_check_id === check.id && c.check_type === 'section'
            )
          : filteredChecks.filter((c: any) => c.parent_check_id === check.id);

      // Add analysis data and screenshots to instances
      const instances = rawInstances.map((instance: any) => {
        const instanceAnalysis = analysisMap.get(instance.id);
        const instanceScreenshots = screenshotsMap.get(instance.id) || [];
        const instanceSectionOverrides = sectionOverridesMap.get(instance.id) || [];
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
          has_section_overrides: instanceSectionOverrides.length > 0,
          section_overrides: instanceSectionOverrides,
        };
      });

      // Flatten element_groups join
      const elementGroup = check.element_groups;

      // Add latest analysis data and screenshots
      const analysis = analysisMap.get(check.id);
      const checkScreenshots = screenshotsMap.get(check.id) || [];
      const checkSectionOverrides = sectionOverridesMap.get(check.id) || [];

      acc.push({
        ...check,
        element_group_slug: elementGroup?.slug || null,
        element_groups: elementGroup ? { name: elementGroup.name } : undefined, // Keep for JOIN compatibility
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
        has_section_overrides: checkSectionOverrides.length > 0,
        section_overrides: checkSectionOverrides,
      });
    }
    return acc;
  }, []);
  console.log(`[Perf] Process checks: ${Date.now() - t4}ms`);

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
  }

  // Fetch codebook details for selected codes
  const selectedCodeIds = (assessment.projects as any)?.selected_code_ids || [];
  const t5 = Date.now();
  const { data: codes } = await supabase
    .from('codes')
    .select('id, title')
    .in('id', selectedCodeIds);
  console.log(`[Perf] Codes query: ${Date.now() - t5}ms`);

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

  console.log(`[Perf] TOTAL page load time: ${Date.now() - startTime}ms`);

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

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

  // Group checks: element instances by (element_group_id, instance_label), standalone sections separately
  const t4 = Date.now();

  // Separate element sections from standalone sections
  const elementSections = filteredChecks.filter((c: any) => c.element_group_id && c.instance_label);
  const standaloneSections = filteredChecks.filter(
    (c: any) => !c.element_group_id || !c.instance_label
  );

  // Group element sections by (element_group_id, instance_label) to create virtual instances
  const instanceMap = new Map<string, any[]>();
  elementSections.forEach((check: any) => {
    const key = `${check.element_group_id}||${check.instance_label}`;
    if (!instanceMap.has(key)) {
      instanceMap.set(key, []);
    }
    instanceMap.get(key)!.push(check);
  });

  // Convert instances to top-level items (representative check + sections array)
  const elementInstances = Array.from(instanceMap.entries()).map(([_key, sections]) => {
    const representative = sections[0]; // Use first section as representative
    const elementGroup = representative.element_groups;

    // Add analysis data to each section
    const sectionsWithData = sections.map((section: any) => {
      const analysis = analysisMap.get(section.id);
      const screenshots = screenshotsMap.get(section.id) || [];
      const sectionOverrides = sectionOverridesMap.get(section.id) || [];
      return {
        ...section,
        element_group_name: elementGroup?.name || null,
        latest_status: analysis?.compliance_status || null,
        latest_confidence: analysis?.confidence || null,
        latest_reasoning: analysis?.ai_reasoning || null,
        latest_analysis: analysis?.violations
          ? {
              violations: analysis.violations,
              recommendations: analysis.recommendations,
            }
          : null,
        screenshots,
        has_section_overrides: sectionOverrides.length > 0,
        section_overrides: sectionOverrides,
      };
    });

    // Calculate aggregate status for the instance (worst status wins)
    const statuses = sectionsWithData.map(s => s.latest_status).filter(Boolean);
    const aggregateStatus = statuses.includes('non_compliant')
      ? 'non_compliant'
      : statuses.includes('insufficient_information')
        ? 'insufficient_information'
        : statuses.includes('compliant')
          ? 'compliant'
          : null;

    return {
      id: representative.id, // Use first section's ID as instance ID
      check_type: 'element', // Virtual type for UI compatibility
      check_name: representative.instance_label,
      instance_label: representative.instance_label,
      element_group_id: representative.element_group_id,
      element_group_name: elementGroup?.name || null,
      element_group_slug: elementGroup?.slug || null,
      element_groups: elementGroup ? { name: elementGroup.name } : undefined,
      assessment_id: representative.assessment_id,
      latest_status: aggregateStatus,
      instances: sectionsWithData, // All sections for this instance
      instance_count: sectionsWithData.length,
      screenshots: [], // Instance-level has no screenshots
      has_section_overrides: sectionsWithData.some(s => s.has_section_overrides),
    };
  });

  // Process standalone section checks
  const standaloneChecks = standaloneSections.map((check: any) => {
    const analysis = analysisMap.get(check.id);
    const checkScreenshots = screenshotsMap.get(check.id) || [];
    const checkSectionOverrides = sectionOverridesMap.get(check.id) || [];
    const elementGroup = check.element_groups;

    return {
      ...check,
      element_group_name: elementGroup?.name || null,
      element_group_slug: elementGroup?.slug || null,
      element_groups: elementGroup ? { name: elementGroup.name } : undefined,
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
      instances: [],
      instance_count: 0,
      has_section_overrides: checkSectionOverrides.length > 0,
      section_overrides: checkSectionOverrides,
    };
  });

  // Combine element instances and standalone sections
  const checks = [...elementInstances, ...standaloneChecks];
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

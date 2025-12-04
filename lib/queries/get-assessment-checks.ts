import { supabaseAdmin } from '@/lib/supabase-server';

export interface GetAssessmentChecksOptions {
  search?: string | null;
  elementGroup?: string | null;
  mode: 'section' | 'element'; // Required: determines query structure and filtering
  includeExcluded?: boolean; // If true, include checks where is_excluded=true
}

/**
 * Fetch checks for an assessment with associated data
 * (analysis runs, screenshots, element instances, sections)
 *
 * This is a shared function that can be called from:
 * - API routes (via NextResponse.json)
 * - Server components (direct call)
 *
 * @param mode - 'section' for code section checks (no element joins), 'element' for element-based checks (with element joins)
 */
export async function getAssessmentChecks(
  assessmentId: string,
  options: GetAssessmentChecksOptions
) {
  const supabase = supabaseAdmin();
  const { search, elementGroup, mode, includeExcluded } = options;

  let query;

  if (mode === 'section') {
    // Section mode: Include section checks AND custom element instances (cloned section checks)
    // We need to LEFT JOIN element_instances to get the custom group info
    query = supabase
      .from('checks')
      .select(
        `
        *,
        element_instances(id, label, element_group_id, element_groups(id, name, slug)),
        sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant, chapters(codes(title)))
      `
      )
      .eq('assessment_id', assessmentId)
      .limit(100000);

    // Only filter out excluded checks if not including them
    if (!includeExcluded) {
      query = query.eq('is_excluded', false);
    }

    // Filter to only include:
    // 1. Section checks (element_group_id IS NULL)
    // 2. Custom element instances (element_group.slug = 'custom')
    // We'll do this filtering after fetch since Supabase doesn't support OR with nested fields easily
  } else {
    // Element mode: INNER JOIN on element_instances (more efficient since we know it exists)
    query = supabase
      .from('checks')
      .select(
        `
        *,
        element_instances!inner(id, label, element_group_id, element_groups(id, name, slug)),
        sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant, chapters(codes(title)))
      `
      )
      .eq('assessment_id', assessmentId)
      .not('element_group_id', 'is', null) // Only element checks
      .limit(100000);

    // Only filter out excluded checks if not including them
    if (!includeExcluded) {
      query = query.eq('is_excluded', false);
    }

    // Filter by specific element group if specified (only applicable in element mode)
    if (elementGroup) {
      const { data: group } = await supabase
        .from('element_groups')
        .select('id')
        .eq('slug', elementGroup)
        .single();

      if (group) {
        query = query.eq('element_group_id', group.id);
      }
    }
  }

  // Handle search queries
  if (search && search.trim()) {
    console.log(
      '[getAssessmentChecks] Search query:',
      search.trim(),
      'Assessment:',
      assessmentId,
      'Mode:',
      mode
    );
    const searchPattern = search.trim().toLowerCase();

    // Build base query for checks - structure depends on mode
    let checksQuery;

    if (mode === 'section') {
      checksQuery = supabase
        .from('checks')
        .select(
          '*, element_instances(id, label, element_group_id, element_groups(id, name, slug)), sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant, chapters(codes(title)))'
        )
        .eq('assessment_id', assessmentId)
        .limit(100000);

      if (!includeExcluded) {
        checksQuery = checksQuery.eq('is_excluded', false);
      }
    } else {
      checksQuery = supabase
        .from('checks')
        .select(
          '*, element_instances!inner(id, label, element_group_id, element_groups(id, name, slug)), sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant, chapters(codes(title)))'
        )
        .eq('assessment_id', assessmentId)
        .not('element_group_id', 'is', null)
        .limit(100000);

      if (!includeExcluded) {
        checksQuery = checksQuery.eq('is_excluded', false);
      }

      // Apply element group filter to search in element mode
      if (elementGroup) {
        const { data: group } = await supabase
          .from('element_groups')
          .select('id')
          .eq('slug', elementGroup)
          .single();

        if (group) {
          checksQuery = checksQuery.eq('element_group_id', group.id);
        }
      }
    }

    // Get all checks for this assessment
    const { data: allChecksData, error: checksError } = await checksQuery;
    if (checksError) throw checksError;

    // Filter out checks for sections marked as never_relevant
    let filteredChecksData = (allChecksData || []).filter((check: any) => {
      return check.sections?.never_relevant !== true;
    });

    // Filter based on mode
    if (mode === 'section') {
      // Section mode: only pure section checks OR ad-hoc element instances
      filteredChecksData = filteredChecksData.filter((check: any) => {
        // Include if no element_instance_id (pure section check)
        if (!check.element_instance_id) return true;

        // Include if element_instance has NULL element_group_id (ad-hoc cloned section checks)
        const elementInstance = check.element_instances;
        if (elementInstance && !elementInstance.element_group_id) return true;

        // Exclude real element checks
        return false;
      });
    } else {
      // Element mode: only checks with real element groups
      filteredChecksData = filteredChecksData.filter((check: any) => {
        const elementInstance = check.element_instances;
        return elementInstance && elementInstance.element_group_id;
      });
    }

    // Fetch latest analysis runs (both AI and agent) and screenshots in parallel
    const [{ data: allAnalysisRuns }, { data: allAgentRuns }, { data: allScreenshots }] =
      await Promise.all([
        supabase
          .from('analysis_runs')
          .select(
            'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, executed_at, checks!inner(assessment_id)'
          )
          .eq('checks.assessment_id', assessmentId)
          .order('run_number', { ascending: false }),
        supabase
          .from('agent_analysis_runs')
          .select(
            'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, completed_at, reasoning_trace, tools_used, iteration_count, checks!inner(assessment_id)'
          )
          .eq('checks.assessment_id', assessmentId)
          .eq('status', 'completed')
          .order('run_number', { ascending: false }),
        supabase
          .from('screenshot_check_assignments')
          .select(
            `
          check_id,
          is_original,
          screenshots (*),
          checks!inner(assessment_id)
        `
          )
          .eq('checks.assessment_id', assessmentId)
          .order('screenshots(created_at)', { ascending: true }),
      ]);

    // Create analysis map - get latest run per check from either table
    const analysisMap = new Map();

    // Add AI runs first
    (allAnalysisRuns || []).forEach((run: any) => {
      if (!analysisMap.has(run.check_id)) {
        analysisMap.set(run.check_id, { ...run, source: 'ai' });
      }
    });

    // Add agent runs, replace if newer
    (allAgentRuns || []).forEach((run: any) => {
      const existing = analysisMap.get(run.check_id);
      const agentRunWithDate = {
        ...run,
        executed_at: run.completed_at,
        source: 'agent',
      };
      if (
        !existing ||
        new Date(run.completed_at) > new Date(existing.executed_at || existing.completed_at)
      ) {
        analysisMap.set(run.check_id, agentRunWithDate);
      }
    });

    // Create screenshots map
    const screenshotsMap = new Map<string, any[]>();
    (allScreenshots || []).forEach((assignment: any) => {
      if (!screenshotsMap.has(assignment.check_id)) {
        screenshotsMap.set(assignment.check_id, []);
      }
      if (assignment.screenshots) {
        screenshotsMap.get(assignment.check_id)!.push({
          ...assignment.screenshots,
          is_original: assignment.is_original,
        });
      }
    });

    // Sort by floorplan_relevant first, then by code_section_number
    const sortedChecksData = filteredChecksData.sort((a: any, b: any) => {
      const aFloorplanRelevant = a.sections?.floorplan_relevant ?? false;
      const bFloorplanRelevant = b.sections?.floorplan_relevant ?? false;

      if (aFloorplanRelevant !== bFloorplanRelevant) {
        return bFloorplanRelevant ? 1 : -1;
      }

      return (a.code_section_number || '').localeCompare(b.code_section_number || '');
    });

    // Add analysis data and screenshots
    const mappedChecks = (sortedChecksData || []).map((check: any) => {
      const analysis = analysisMap.get(check.id);
      const screenshots = screenshotsMap.get(check.id) || [];

      // Extract element data based on mode
      const elementInstance = mode === 'element' ? check.element_instances : null;
      const elementGroup = elementInstance?.element_groups;

      return {
        ...check,
        // Flatten element data
        element_instance_label: elementInstance?.label || null,
        element_group_id: elementGroup?.id || null,
        element_group_name: elementGroup?.name || null,
        element_group_slug: elementGroup?.slug || null,
        element_instances: undefined,
        // Flatten code data
        code_title: check.sections?.chapters?.codes?.title || null,
        // Analysis data
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
      };
    });

    // Filter by check fields (fast, in-memory)
    const checksMatchingCheckFields = mappedChecks.filter(
      (check: any) =>
        check.code_section_number?.toLowerCase().includes(searchPattern) ||
        check.code_section_title?.toLowerCase().includes(searchPattern)
    );

    console.log(
      '[getAssessmentChecks] Checks matching titles/numbers:',
      checksMatchingCheckFields.length
    );

    // Get sections that match the search pattern
    const { data: matchingSections, error: sectionsError } = await supabase
      .from('sections')
      .select('id')
      .eq('never_relevant', false)
      .ilike('text', `%${searchPattern}%`);

    if (sectionsError) throw sectionsError;

    console.log('[getAssessmentChecks] Sections matching content:', matchingSections?.length);

    // Create a set of matching section IDs
    const matchingSectionIds = new Set(matchingSections?.map((s: any) => s.id) || []);

    // Get checks that reference matching sections
    const checksMatchingSectionContent = mappedChecks.filter((check: any) =>
      matchingSectionIds.has(check.section_id)
    );

    console.log(
      '[getAssessmentChecks] Checks matching section content:',
      checksMatchingSectionContent.length
    );

    // Combine both sets (unique checks)
    const allMatchingCheckIds = new Set([
      ...checksMatchingCheckFields.map((c: any) => c.id),
      ...checksMatchingSectionContent.map((c: any) => c.id),
    ]);

    const allChecks = mappedChecks.filter((check: any) => allMatchingCheckIds.has(check.id));

    console.log('[getAssessmentChecks] Total unique matches:', allChecks.length);

    // Return checks with flat structure
    return allChecks.map((check: any) => ({
      ...check,
      instances: [],
      instance_count: 0,
    }));
  }

  // No search - fetch all checks in batches
  // Note: Supabase range() has a hard limit of 1000 rows per call
  let allChecks: any[] = [];
  let hasMore = true;
  let offset = 0;
  const batchSize = 1000; // Supabase's hard limit per range() call

  while (hasMore) {
    const { data: batch, error } = await query.range(offset, offset + batchSize - 1);
    if (error) throw error;

    if (batch && batch.length > 0) {
      allChecks = allChecks.concat(batch);
      offset += batchSize;
      // Continue if we got a full batch (indicates there might be more)
      hasMore = batch.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  console.log(
    `[getAssessmentChecks] Fetched ${allChecks.length} checks in ${Math.ceil(allChecks.length / batchSize)} batches`
  );

  // Filter checks based on mode
  if (mode === 'section') {
    // Section mode: only pure section checks OR ad-hoc element instances (element_instances with NULL element_group_id)
    allChecks = allChecks.filter((check: any) => {
      // Include if no element_instance_id (pure section check)
      if (!check.element_instance_id) return true;

      // Include if element_instance has NULL element_group_id (ad-hoc cloned section checks)
      const elementInstance = check.element_instances;
      if (elementInstance && !elementInstance.element_group_id) return true;

      // Exclude real element checks (those with an element_group)
      return false;
    });

    console.log(`[getAssessmentChecks] After section mode filter: ${allChecks.length} checks`);
  } else {
    // Element mode: only checks with real element groups (exclude ad-hoc instances)
    allChecks = allChecks.filter((check: any) => {
      const elementInstance = check.element_instances;
      // Must have element_instance with a real element_group_id
      return elementInstance && elementInstance.element_group_id;
    });

    console.log(`[getAssessmentChecks] After element mode filter: ${allChecks.length} checks`);
  }

  // Fetch screenshots and analysis runs (both AI and agent) in parallel
  const [{ data: allScreenshots }, { data: allAnalysisRuns }, { data: allAgentRuns }] =
    await Promise.all([
      supabase
        .from('screenshot_check_assignments')
        .select(
          `
        check_id,
        is_original,
        screenshots (*),
        checks!inner(assessment_id)
      `
        )
        .eq('checks.assessment_id', assessmentId)
        .order('screenshots(created_at)', { ascending: true }),
      allChecks.length > 0
        ? supabase
            .from('analysis_runs')
            .select(
              'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, executed_at, checks!inner(assessment_id)'
            )
            .eq('checks.assessment_id', assessmentId)
            .order('run_number', { ascending: false })
        : Promise.resolve({ data: null }),
      allChecks.length > 0
        ? supabase
            .from('agent_analysis_runs')
            .select(
              'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, completed_at, reasoning_trace, tools_used, iteration_count, checks!inner(assessment_id)'
            )
            .eq('checks.assessment_id', assessmentId)
            .eq('status', 'completed')
            .order('run_number', { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

  console.log('[getAssessmentChecks] Fetched screenshot assignments:', allScreenshots?.length || 0);

  // Sort checks by floorplan_relevant first, then by code_section_number
  const sortedChecks = allChecks.sort((a: any, b: any) => {
    const aFloorplanRelevant = a.sections?.floorplan_relevant ?? false;
    const bFloorplanRelevant = b.sections?.floorplan_relevant ?? false;

    if (aFloorplanRelevant !== bFloorplanRelevant) {
      return bFloorplanRelevant ? 1 : -1;
    }

    return (a.code_section_number || '').localeCompare(b.code_section_number || '');
  });

  // Create analysis map - get latest run per check from either table
  const analysisMap = new Map();

  // Add AI runs first
  (allAnalysisRuns || []).forEach((run: any) => {
    if (!analysisMap.has(run.check_id)) {
      analysisMap.set(run.check_id, { ...run, source: 'ai' });
    }
  });

  // Add agent runs, replace if newer
  (allAgentRuns || []).forEach((run: any) => {
    const existing = analysisMap.get(run.check_id);
    const agentRunWithDate = {
      ...run,
      executed_at: run.completed_at,
      source: 'agent',
    };
    if (
      !existing ||
      new Date(run.completed_at) > new Date(existing.executed_at || existing.completed_at)
    ) {
      analysisMap.set(run.check_id, agentRunWithDate);
    }
  });

  console.log('[getAssessmentChecks] Analysis map size:', analysisMap.size);

  // Create screenshots map
  const screenshotsMap = new Map<string, any[]>();
  (allScreenshots || []).forEach((assignment: any) => {
    if (!screenshotsMap.has(assignment.check_id)) {
      screenshotsMap.set(assignment.check_id, []);
    }
    if (assignment.screenshots) {
      screenshotsMap.get(assignment.check_id)!.push({
        ...assignment.screenshots,
        is_original: assignment.is_original,
      });
    }
  });

  console.log('[getAssessmentChecks] Screenshots map created:', {
    checksWithScreenshots: screenshotsMap.size,
    totalScreenshots: Array.from(screenshotsMap.values()).flat().length,
  });

  // Add analysis data and screenshots to checks
  const mappedChecks = (sortedChecks || []).map((check: any) => {
    const analysis = analysisMap.get(check.id);
    const screenshots = screenshotsMap.get(check.id) || [];

    // Flatten element_instances data
    const elementInstance = check.element_instances;
    const elementGroup = elementInstance?.element_groups;

    return {
      ...check,
      // New schema fields
      element_instance_label: elementInstance?.label || null,
      element_group_id: elementGroup?.id || null,
      element_group_name: elementGroup?.name || null,
      element_group_slug: elementGroup?.slug || null,
      // Remove nested element_instances, keep sections with key
      element_instances: undefined,
      // Flatten code data
      code_title: check.sections?.chapters?.codes?.title || null,
      // Analysis data
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
    };
  });

  // Return checks with flat structure
  const checks = mappedChecks.map((check: any) => ({
    ...check,
    instances: [],
    instance_count: 0,
  }));

  console.log('[getAssessmentChecks] Returning', checks.length, 'total checks');
  return checks;
}

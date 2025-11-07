import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const elementGroup = searchParams.get('element_group'); // e.g., 'doors', 'bathrooms', 'kitchens'
  const supabase = supabaseAdmin();

  try {
    // Join with element_groups to get element_group_name and sections to get floorplan_relevant, never_relevant, and key
    let query = supabase
      .from('checks')
      .select(
        `
        *, 
        element_instances(id, label, element_group_id, element_groups(id, name, slug)),
        sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant)
      `
      )
      .eq('assessment_id', id)
      .limit(20000); // Override Supabase default 1000 row limit

    // Filter by element group if specified
    if (elementGroup) {
      // Get the element_group_id for this slug
      const { data: group } = await supabase
        .from('element_groups')
        .select('id')
        .eq('slug', elementGroup)
        .single();

      if (group) {
        query = query.eq('element_group_id', group.id);
      }
    }

    // Add full-text search if search query provided
    if (search && search.trim()) {
      console.log('[SEARCH] Query:', search.trim(), 'Assessment ID:', id);
      const searchPattern = search.trim().toLowerCase();

      // Build base query for checks with element_groups and sections joins
      let checksQuery = supabase
        .from('checks')
        .select(
          '*, element_groups(name), sections!checks_section_id_fkey(key, floorplan_relevant, never_relevant)'
        )
        .eq('assessment_id', id)
        .limit(20000); // Override Supabase default 1000 row limit

      // Apply element group filter to search as well
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

      // Get all checks for this assessment (with optional element filter)
      const { data: allChecksData, error: checksError } = await checksQuery;

      if (checksError) {
        console.error('[SEARCH] Checks error:', checksError);
        throw checksError;
      }

      // Filter out checks for sections marked as never_relevant
      const filteredChecksData = (allChecksData || []).filter((check: any) => {
        return check.sections?.never_relevant !== true;
      });

      if (filteredChecksData.length < (allChecksData?.length || 0)) {
        console.log(
          '[SEARCH] Filtered out',
          (allChecksData?.length || 0) - filteredChecksData.length,
          'never_relevant checks'
        );
      }

      // Fetch latest analysis runs and screenshots for all checks
      // Use JOIN filter on assessment_id instead of passing check IDs (avoids URL length limits)
      const [{ data: allAnalysisRuns }, { data: allScreenshots }] = await Promise.all([
        supabase
          .from('analysis_runs')
          .select(
            'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, checks!inner(assessment_id)'
          )
          .eq('checks.assessment_id', id)
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
          .eq('checks.assessment_id', id)
          .order('screenshots(created_at)', { ascending: true }),
      ]);

      // Create analysis map - get latest run per check (highest run_number)
      const analysisMap = new Map();
      (allAnalysisRuns || []).forEach((run: any) => {
        if (!analysisMap.has(run.check_id)) {
          analysisMap.set(run.check_id, run);
        }
      });

      // Create screenshots map
      const screenshotsMap = new Map<string, any[]>();
      (allScreenshots || []).forEach((assignment: any) => {
        if (!screenshotsMap.has(assignment.check_id)) {
          screenshotsMap.set(assignment.check_id, []);
        }
        // Flatten the screenshot with assignment metadata
        if (assignment.screenshots) {
          screenshotsMap.get(assignment.check_id)!.push({
            ...assignment.screenshots,
            is_original: assignment.is_original,
          });
        }
      });

      // Sort by floorplan_relevant first (true comes first), then by code_section_number
      const sortedAllChecksData = filteredChecksData.sort((a: any, b: any) => {
        const aFloorplanRelevant = a.sections?.floorplan_relevant ?? false;
        const bFloorplanRelevant = b.sections?.floorplan_relevant ?? false;

        // First sort by floorplan_relevant (descending - true first)
        if (aFloorplanRelevant !== bFloorplanRelevant) {
          return bFloorplanRelevant ? 1 : -1;
        }

        // Then sort by code_section_number (ascending)
        return (a.code_section_number || '').localeCompare(b.code_section_number || '');
      });

      // Add analysis data and screenshots (element_groups is kept from JOIN)
      const mappedChecks = (sortedAllChecksData || []).map((check: any) => {
        const analysis = analysisMap.get(check.id);
        const screenshots = screenshotsMap.get(check.id) || [];

        return {
          ...check,
          element_group_name: check.element_groups?.name || null, // Flatten element group name
          element_groups: undefined, // Remove nested element_groups object
          // Keep sections object with key for frontend
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

      // First filter by check fields (fast, in-memory)
      const checksMatchingCheckFields =
        mappedChecks.filter(
          (check: any) =>
            check.code_section_number?.toLowerCase().includes(searchPattern) ||
            check.code_section_title?.toLowerCase().includes(searchPattern)
        ) || [];

      console.log('[SEARCH] Checks matching titles/numbers:', checksMatchingCheckFields.length);

      // Get sections that match the search pattern (search in text field only, paragraphs is JSONB)
      const { data: matchingSections, error: sectionsError } = await supabase
        .from('sections')
        .select('id')
        .eq('never_relevant', false)
        .ilike('text', `%${searchPattern}%`);

      if (sectionsError) {
        console.error('[SEARCH] Sections error:', sectionsError);
        throw sectionsError;
      }

      console.log('[SEARCH] Sections matching content:', matchingSections?.length);

      // Create a set of matching section IDs
      const matchingSectionIds = new Set(matchingSections?.map((s: any) => s.id) || []);

      // Get checks that reference matching sections
      const checksMatchingSectionContent =
        mappedChecks.filter((check: any) => matchingSectionIds.has(check.section_id)) || [];

      console.log('[SEARCH] Checks matching section content:', checksMatchingSectionContent.length);

      // Combine both sets (unique checks)
      const allMatchingCheckIds = new Set([
        ...checksMatchingCheckFields.map((c: any) => c.id),
        ...checksMatchingSectionContent.map((c: any) => c.id),
      ]);

      const allChecks =
        mappedChecks.filter((check: any) => allMatchingCheckIds.has(check.id)) || [];

      console.log('[SEARCH] Total unique matches:', allChecks.length);

      // All checks are flat section checks - return them all
      const checks = allChecks.map((check: any) => ({
        ...check,
        instances: [],
        instance_count: 0,
      }));

      return NextResponse.json(checks);
    }

    // No search - fetch all data in batches (Supabase has a 1000 row limit per query)
    let allChecks: any[] = [];
    let hasMore = true;
    let offset = 0;
    const batchSize = 1000;

    while (hasMore) {
      const { data: batch, error } = await query.range(offset, offset + batchSize - 1);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch checks', details: error.message },
          { status: 500 }
        );
      }

      if (batch && batch.length > 0) {
        allChecks = allChecks.concat(batch);
        offset += batchSize;
        hasMore = batch.length === batchSize; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    console.log(
      `[CHECKS API] Fetched ${allChecks.length} checks in ${Math.ceil(allChecks.length / batchSize)} batches`
    );

    // Fetch screenshots for all checks via junction table
    // Use JOIN filter on assessment_id instead of passing 256+ check IDs (avoids URL length limits)

    const { data: allScreenshots, error: screenshotsError } = await supabase
      .from('screenshot_check_assignments')
      .select(
        `
        check_id,
        is_original,
        screenshots (*),
        checks!inner(assessment_id)
      `
      )
      .eq('checks.assessment_id', id)
      .order('screenshots(created_at)', { ascending: true });

    if (screenshotsError) {
      console.error('[CHECKS API] ❌ Error fetching screenshots:', screenshotsError);
    } else {
      console.log('[CHECKS API] ✅ Fetched screenshot assignments:', {
        totalAssignments: allScreenshots?.length || 0,
        uniqueChecks: new Set(allScreenshots?.map((a: any) => a.check_id)).size,
      });
    }

    // Sort by floorplan_relevant first (true comes first), then by code_section_number
    const sortedChecks = allChecks.sort((a: any, b: any) => {
      const aFloorplanRelevant = a.sections?.floorplan_relevant ?? false;
      const bFloorplanRelevant = b.sections?.floorplan_relevant ?? false;

      // First sort by floorplan_relevant (descending - true first)
      if (aFloorplanRelevant !== bFloorplanRelevant) {
        return bFloorplanRelevant ? 1 : -1;
      }

      // Then sort by code_section_number (ascending)
      return (a.code_section_number || '').localeCompare(b.code_section_number || '');
    });

    let allAnalysisRuns = null;

    // Fetch analysis runs using JOIN filter on assessment_id (avoids URL length limits)
    if (sortedChecks.length > 0) {
      try {
        const result = await supabase
          .from('analysis_runs')
          .select(
            'check_id, run_number, compliance_status, confidence, ai_reasoning, violations, recommendations, checks!inner(assessment_id)'
          )
          .eq('checks.assessment_id', id)
          .order('run_number', { ascending: false });

        allAnalysisRuns = result.data;
      } catch (error) {
        console.error('[CHECKS API] ❌ Exception fetching analysis runs:', error);
      }
    } else {
      console.log('[CHECKS API] No check IDs to fetch analysis runs for');
    }

    // Create analysis map - get latest run per check (highest run_number)
    const analysisMap = new Map();
    (allAnalysisRuns || []).forEach((run: any) => {
      if (!analysisMap.has(run.check_id)) {
        analysisMap.set(run.check_id, run);
      }
    });

    console.log('[CHECKS API] Analysis map size:', analysisMap.size);

    // Create screenshots map
    const screenshotsMap = new Map<string, any[]>();
    (allScreenshots || []).forEach((assignment: any) => {
      if (!screenshotsMap.has(assignment.check_id)) {
        screenshotsMap.set(assignment.check_id, []);
      }
      // Flatten the screenshot with assignment metadata
      if (assignment.screenshots) {
        screenshotsMap.get(assignment.check_id)!.push({
          ...assignment.screenshots,
          is_original: assignment.is_original,
        });
      }
    });

    console.log('[CHECKS API] Screenshots map created:', {
      checksWithScreenshots: screenshotsMap.size,
      totalScreenshots: Array.from(screenshotsMap.values()).flat().length,
    });

    // Add analysis data and screenshots
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

    // All checks are flat section checks - return them all
    const checks = mappedChecks.map((check: any) => ({
      ...check,
      instances: [],
      instance_count: 0,
    }));

    // Log detailed screenshot info for checks with instances
    const checksWithInstances = checks.filter((c: any) => c.instances && c.instances.length > 0);
    console.log('[CHECKS API] Checks with instances array:', checksWithInstances.length);

    console.log('[CHECKS API] Returning', checks.length, 'total checks');
    return NextResponse.json(checks);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch checks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

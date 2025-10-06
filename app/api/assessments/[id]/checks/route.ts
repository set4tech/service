import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const elementGroup = searchParams.get('element_group'); // e.g., 'doors', 'bathrooms', 'kitchens'
  const supabase = supabaseAdmin();

  try {
    // Join with element_groups to get element_group_name and sections to get floorplan_relevant and never_relevant
    let query = supabase
      .from('checks')
      .select(
        '*, element_groups(name), sections!code_section_key(floorplan_relevant, never_relevant)'
      )
      .eq('assessment_id', id);

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
          '*, element_groups(name), sections!code_section_key(floorplan_relevant, never_relevant)'
        )
        .eq('assessment_id', id);

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
      // BUT keep element templates (instance_number = 0) even if never_relevant, since they're used for cloning
      const filteredChecksData = (allChecksData || []).filter((check: any) => {
        return check.sections?.never_relevant !== true || check.instance_number === 0;
      });

      if (filteredChecksData.length < (allChecksData?.length || 0)) {
        console.log(
          '[SEARCH] Filtered out',
          (allChecksData?.length || 0) - filteredChecksData.length,
          'never_relevant checks'
        );
      }

      // Fetch latest analysis runs, screenshots, and section overrides for all checks
      const checkIds = filteredChecksData.map((c: any) => c.id);
      const [{ data: latestAnalysis }, { data: allScreenshots }, { data: sectionOverrides }] =
        await Promise.all([
          supabase
            .from('latest_analysis_runs')
            .select(
              'check_id, compliance_status, confidence, ai_reasoning, violations, recommendations'
            )
            .in('check_id', checkIds),
          supabase
            .from('screenshot_check_assignments')
            .select(
              `
            check_id,
            is_original,
            screenshots (*)
          `
            )
            .in('check_id', checkIds)
            .order('screenshots(created_at)', { ascending: true }),
          supabase
            .from('section_overrides')
            .select('check_id, section_key')
            .in('check_id', checkIds),
        ]);

      // Create analysis map
      const analysisMap = new Map((latestAnalysis || []).map(a => [a.check_id, a]));

      // Create section overrides map (check_id -> set of section_keys with overrides)
      const overridesMap = new Map<string, Set<string>>();
      (sectionOverrides || []).forEach((override: any) => {
        if (!overridesMap.has(override.check_id)) {
          overridesMap.set(override.check_id, new Set());
        }
        overridesMap.get(override.check_id)!.add(override.section_key);
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

      // Map element_groups.name to element_group_name and add analysis data and screenshots
      const mappedChecks = (sortedAllChecksData || []).map((check: any) => {
        const analysis = analysisMap.get(check.id);
        const screenshots = screenshotsMap.get(check.id) || [];
        const sectionOverridesSet = overridesMap.get(check.id);

        // For element checks, check if all sections have overrides
        let allSectionsOverridden = false;
        if (
          check.element_sections &&
          Array.isArray(check.element_sections) &&
          sectionOverridesSet
        ) {
          const allOverridden = check.element_sections.every((sectionKey: string) =>
            sectionOverridesSet.has(sectionKey)
          );
          allSectionsOverridden = allOverridden && check.element_sections.length > 0;
        }

        return {
          ...check,
          element_group_name: check.element_groups?.name || null,
          element_groups: undefined, // Remove nested object
          sections: undefined, // Remove nested sections object (used only for sorting)
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
          has_section_overrides: allSectionsOverridden,
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
        .select('key')
        .eq('never_relevant', false)
        .ilike('text', `%${searchPattern}%`);

      if (sectionsError) {
        console.error('[SEARCH] Sections error:', sectionsError);
        throw sectionsError;
      }

      console.log('[SEARCH] Sections matching content:', matchingSections?.length);

      // Create a set of matching section keys
      const matchingSectionKeys = new Set(matchingSections?.map((s: any) => s.key) || []);

      // Get checks that reference matching sections
      const checksMatchingSectionContent =
        mappedChecks.filter((check: any) => matchingSectionKeys.has(check.code_section_key)) || [];

      console.log('[SEARCH] Checks matching section content:', checksMatchingSectionContent.length);

      // Combine both sets (unique checks)
      const allMatchingCheckIds = new Set([
        ...checksMatchingCheckFields.map((c: any) => c.id),
        ...checksMatchingSectionContent.map((c: any) => c.id),
      ]);

      const allChecks =
        mappedChecks.filter((check: any) => allMatchingCheckIds.has(check.id)) || [];

      console.log('[SEARCH] Total unique matches:', allChecks.length);

      // Group and return
      const checks = allChecks.reduce((acc: any[], check: any) => {
        if (!check.parent_check_id) {
          const instances = allChecks.filter((c: any) => c.parent_check_id === check.id);
          acc.push({ ...check, instances, instance_count: instances.length });
        }
        return acc;
      }, []);

      return NextResponse.json(checks);
    }

    // No search - use original query
    const { data: allChecks, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch checks', details: error.message },
        { status: 500 }
      );
    }

    // Filter out checks for sections marked as never_relevant
    // BUT keep element templates (instance_number = 0) even if never_relevant, since they're used for cloning
    const filteredChecks = (allChecks || []).filter((check: any) => {
      return check.sections?.never_relevant !== true || check.instance_number === 0;
    });

    if (filteredChecks.length < (allChecks?.length || 0)) {
      console.log(
        '[CHECKS API] Filtered out',
        (allChecks?.length || 0) - filteredChecks.length,
        'never_relevant checks'
      );
    }

    // Fetch screenshots for all checks via junction table
    const checkIds = filteredChecks.map((c: any) => c.id);
    console.log('[CHECKS API] Fetching screenshots for', checkIds.length, 'checks');

    const { data: allScreenshots, error: screenshotsError } = await supabase
      .from('screenshot_check_assignments')
      .select(
        `
        check_id,
        is_original,
        screenshots (*)
      `
      )
      .in('check_id', checkIds)
      .order('screenshots(created_at)', { ascending: true });

    if (screenshotsError) {
      console.error('[CHECKS API] ❌ Error fetching screenshots:', screenshotsError);
    } else {
      console.log('[CHECKS API] ✅ Fetched screenshot assignments:', {
        totalAssignments: allScreenshots?.length || 0,
        uniqueChecks: new Set(allScreenshots?.map((a: any) => a.check_id)).size,
      });

      // Log a sample of assignments
      if (allScreenshots && allScreenshots.length > 0) {
        console.log('[CHECKS API] Sample assignments:', allScreenshots.slice(0, 3));
      }
    }

    // Sort by floorplan_relevant first (true comes first), then by code_section_number
    const sortedChecks = filteredChecks.sort((a: any, b: any) => {
      const aFloorplanRelevant = a.sections?.floorplan_relevant ?? false;
      const bFloorplanRelevant = b.sections?.floorplan_relevant ?? false;

      // First sort by floorplan_relevant (descending - true first)
      if (aFloorplanRelevant !== bFloorplanRelevant) {
        return bFloorplanRelevant ? 1 : -1;
      }

      // Then sort by code_section_number (ascending)
      return (a.code_section_number || '').localeCompare(b.code_section_number || '');
    });

    // Fetch latest analysis runs and section overrides for all checks (reusing checkIds from above)
    const [{ data: latestAnalysis }, { data: sectionOverrides }] = await Promise.all([
      supabase
        .from('latest_analysis_runs')
        .select(
          'check_id, compliance_status, confidence, ai_reasoning, violations, recommendations'
        )
        .in('check_id', checkIds),
      supabase.from('section_overrides').select('check_id, section_key').in('check_id', checkIds),
    ]);

    // Create analysis map
    const analysisMap = new Map((latestAnalysis || []).map(a => [a.check_id, a]));

    // Create section overrides map (check_id -> set of section_keys with overrides)
    const overridesMap = new Map<string, Set<string>>();
    (sectionOverrides || []).forEach((override: any) => {
      if (!overridesMap.has(override.check_id)) {
        overridesMap.set(override.check_id, new Set());
      }
      overridesMap.get(override.check_id)!.add(override.section_key);
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

    console.log('[CHECKS API] Screenshots map created:', {
      checksWithScreenshots: screenshotsMap.size,
      totalScreenshots: Array.from(screenshotsMap.values()).flat().length,
    });

    // Map element_groups.name to element_group_name and add analysis data and screenshots
    const mappedChecks = (sortedChecks || []).map((check: any) => {
      const analysis = analysisMap.get(check.id);
      const screenshots = screenshotsMap.get(check.id) || [];
      const sectionOverridesSet = overridesMap.get(check.id);

      // For element checks, check if all sections have overrides
      let allSectionsOverridden = false;
      if (check.element_sections && Array.isArray(check.element_sections) && sectionOverridesSet) {
        const allOverridden = check.element_sections.every((sectionKey: string) =>
          sectionOverridesSet.has(sectionKey)
        );
        allSectionsOverridden = allOverridden && check.element_sections.length > 0;
      }

      return {
        ...check,
        element_group_name: check.element_groups?.name || null,
        element_groups: undefined, // Remove nested object
        sections: undefined, // Remove nested sections object (used only for sorting)
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
        has_section_overrides: allSectionsOverridden,
      };
    });

    // Group checks by parent - instances will be nested under their parent
    const checks = mappedChecks.reduce((acc: any[], check: any) => {
      if (!check.parent_check_id) {
        // This is a parent check - find all its instances
        const instances = mappedChecks.filter((c: any) => c.parent_check_id === check.id);
        acc.push({
          ...check,
          instances,
          instance_count: instances.length,
        });
      }
      return acc;
    }, []);

    // Log detailed screenshot info for checks with instances
    const checksWithInstances = checks.filter((c: any) => c.instances && c.instances.length > 0);
    console.log('[CHECKS API] Checks with instances:', checksWithInstances.length);
    checksWithInstances.slice(0, 3).forEach((check: any) => {
      console.log(`[CHECKS API] Parent check ${check.code_section_number}:`, {
        parentScreenshots: check.screenshots?.length || 0,
        instances: check.instances.map((i: any) => ({
          label: i.instance_label,
          screenshots: i.screenshots?.length || 0,
        })),
      });
    });

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

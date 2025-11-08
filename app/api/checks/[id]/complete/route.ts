import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/checks/[id]/complete
 *
 * Returns EVERYTHING needed to display the CodeDetailPanel in a single optimized request:
 * - Check data with section key
 * - All sibling checks (if element instance)
 * - Code section with references (via RPC)
 * - Analysis runs
 * - Assessment progress
 *
 * This replaces 4 sequential calls with 1 optimized call using parallel queries.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    // Step 1: Get the check data first (need this to determine if it's an element instance)
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select(
        '*, sections!checks_section_id_fkey(key), element_instances(id, label, element_group_id, element_groups(id, name, slug))'
      )
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    // Step 2: Determine what additional data we need
    const sectionKey = check.sections?.key;
    const elementInstanceId = check.element_instance_id;

    // Step 3: Execute all remaining queries in parallel
    const analysisRunsQuery = supabase
      .from('analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false });

    const siblingChecksQuery = elementInstanceId
      ? supabase
          .from('checks')
          .select(
            '*, sections!checks_section_id_fkey(key), element_instances(id, label, element_group_id, element_groups(id, name, slug))'
          )
          .eq('element_instance_id', elementInstanceId)
          .order('code_section_number')
      : null;

    const codeSectionQuery = sectionKey
      ? supabase.rpc('get_section_with_references', {
          section_key: sectionKey,
        })
      : null;

    // Fetch screenshots for this check
    const screenshotsQuery = supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        )
      `
      )
      .eq('screenshot_check_assignments.check_id', checkId)
      .order('created_at', { ascending: false });

    // Execute all parallel queries
    const [analysisRunsResult, siblingChecksResult, codeSectionResult, screenshotsResult] =
      await Promise.all([
        analysisRunsQuery,
        siblingChecksQuery || Promise.resolve({ data: null, error: null }),
        codeSectionQuery || Promise.resolve({ data: null, error: null }),
        screenshotsQuery,
      ]);

    // Process results
    const analysisRuns = analysisRunsResult.data || [];
    const siblingChecks = siblingChecksResult.data || [];
    const codeSectionData = codeSectionResult.data;

    // Flatten screenshot assignment metadata
    const screenshots = (screenshotsResult.data || []).map((item: any) => ({
      ...item,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      screenshot_check_assignments: undefined,
    }));

    // Format code section data
    let codeSection = null;
    if (codeSectionData?.section) {
      const section = codeSectionData.section;
      const paragraphs = section.paragraphs || [];
      const fullText = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';

      codeSection = {
        ...section,
        fullText,
        references: codeSectionData.references,
      };
    }

    // Calculate assessment progress
    let progress = {
      inProgress: false,
      completed: 0,
      total: 0,
      batchGroupId: null as string | null,
    };

    if (analysisRuns.length > 0) {
      const latestRun = analysisRuns[0];
      const batchGroupId = latestRun.batch_group_id;
      const totalBatches = latestRun.total_batches || 0;

      if (batchGroupId) {
        const completedBatches = analysisRuns.filter(
          (r: any) => r.batch_group_id === batchGroupId
        ).length;
        const inProgress = check.status !== 'completed' && completedBatches < totalBatches;

        progress = {
          inProgress,
          completed: completedBatches,
          total: totalBatches,
          batchGroupId,
        };
      }
    } else if (check.status === 'processing') {
      progress = {
        inProgress: true,
        completed: 0,
        total: siblingChecks.length || 1,
        batchGroupId: null,
      };
    }

    return NextResponse.json({
      check: { ...check, screenshots },
      siblingChecks: elementInstanceId ? siblingChecks : [],
      codeSection,
      analysisRuns,
      progress,
    });
  } catch (error: any) {
    console.error('[GET /api/checks/[id]/complete] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch complete check data' },
      { status: 500 }
    );
  }
}

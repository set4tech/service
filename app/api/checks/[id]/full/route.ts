import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/checks/[id]/full
 *
 * Returns complete check data including analysis runs and progress in 2 parallel queries.
 * Much simpler than RPC approach, easier to debug and maintain.
 *
 * Replaces the need for separate calls to:
 * - /api/checks/[id]
 * - /api/checks/[id]/analysis-runs
 * - /api/checks/[id]/assessment-progress
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    // Execute both queries in parallel for optimal performance
    const [checkResult, initialRunsResult] = await Promise.all([
      supabase
        .from('checks')
        .select('*, sections!checks_section_id_fkey(key)')
        .eq('id', checkId)
        .single(),
      supabase
        .from('analysis_runs')
        .select('*')
        .eq('check_id', checkId)
        .order('run_number', { ascending: false }),
    ]);

    if (checkResult.error || !checkResult.data) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    const check = checkResult.data;

    // Determine if element-grouped and get all relevant check IDs
    let checkIds: string[] = [checkId];
    const isElementGrouped = !!check.element_group_id && !!check.instance_label;

    // If element-grouped, we need to get runs for all sibling checks
    let runs = initialRunsResult.data || [];

    if (isElementGrouped) {
      // Get sibling check IDs
      const { data: siblings } = await supabase
        .from('checks')
        .select('id')
        .eq('assessment_id', check.assessment_id)
        .eq('element_group_id', check.element_group_id)
        .eq('instance_label', check.instance_label);

      if (siblings && siblings.length > 0) {
        checkIds = siblings.map(s => s.id);

        // Fetch runs for all siblings (only if we have more than just this check)
        if (checkIds.length > 1) {
          const { data: allRuns } = await supabase
            .from('analysis_runs')
            .select('*')
            .in('check_id', checkIds)
            .order('run_number', { ascending: false });

          runs = allRuns || [];
        }
      }
    }

    // Calculate progress in TypeScript (simple, testable, debuggable)
    let progress = {
      inProgress: false,
      completed: 0,
      total: 0,
      batchGroupId: null as string | null,
    };

    if (runs.length > 0) {
      const latestRun = runs[0];
      const batchGroupId = latestRun.batch_group_id;
      const totalBatches = latestRun.total_batches || 0;

      if (batchGroupId) {
        const completedBatches = runs.filter(r => r.batch_group_id === batchGroupId).length;
        const inProgress = check.status !== 'completed' && completedBatches < totalBatches;

        progress = {
          inProgress,
          completed: completedBatches,
          total: totalBatches,
          batchGroupId,
        };
      }
    } else if (check.status === 'processing') {
      // Jobs queued but not processed yet
      progress = {
        inProgress: true,
        completed: 0,
        total: checkIds.length,
        batchGroupId: null,
      };
    }

    return NextResponse.json({
      check,
      analysisRuns: runs,
      progress,
    });
  } catch (error: any) {
    console.error('Error fetching full check data:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch check data' },
      { status: 500 }
    );
  }
}

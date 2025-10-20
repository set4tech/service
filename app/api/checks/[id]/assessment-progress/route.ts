import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    // First, get the check to see if it's element-grouped
    const { data: check } = await supabase
      .from('checks')
      .select('id, assessment_id, element_group_id, instance_label, status')
      .eq('id', checkId)
      .single();

    if (!check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    // Determine which check IDs to query for runs
    let checkIds: string[] = [checkId];
    const isElementGrouped = !!check.element_group_id && !!check.instance_label;

    if (isElementGrouped) {
      // Find all sibling checks in this element group
      const { data: siblings } = await supabase
        .from('checks')
        .select('id')
        .eq('assessment_id', check.assessment_id)
        .eq('element_group_id', check.element_group_id)
        .eq('instance_label', check.instance_label);

      if (siblings && siblings.length > 0) {
        checkIds = siblings.map(s => s.id);
        console.log(`[Progress] Element-grouped check: found ${checkIds.length} siblings`);
      }
    }

    // Get the latest batch group for these checks
    const { data: latestRun } = await supabase
      .from('analysis_runs')
      .select('batch_group_id, total_batches')
      .in('check_id', checkIds)
      .order('executed_at', { ascending: false })
      .limit(1)
      .single();

    console.log(`[Progress] Check ${checkId}: latestRun =`, latestRun);

    if (!latestRun || !latestRun.batch_group_id) {
      // No runs yet - check if assessment was just started by looking at check status
      console.log(`[Progress] Check ${checkId}: No runs found, check status =`, check?.status);

      // If check is processing, assume assessment is in progress (jobs queued but not processed yet)
      if (check?.status === 'processing') {
        return NextResponse.json({
          inProgress: true,
          completed: 0,
          total: checkIds.length, // Total is number of sibling checks
          runs: [],
        });
      }

      return NextResponse.json({
        inProgress: false,
        completed: 0,
        total: 0,
        runs: [],
      });
    }

    // Get all runs for this batch group across all sibling checks
    const { data: runs } = await supabase
      .from('analysis_runs')
      .select('*')
      .eq('batch_group_id', latestRun.batch_group_id)
      .in('check_id', checkIds)
      .order('batch_number', { ascending: true });

    const totalBatches = latestRun.total_batches || 0;
    const completedBatches = runs?.length || 0;
    // If check status is 'completed', don't show as in progress even if batches incomplete
    // This handles cases where batch jobs failed/stopped but we have some analysis results
    const inProgress = check.status !== 'completed' && completedBatches < totalBatches;

    console.log(
      `[Progress] Check ${checkId}: ${completedBatches}/${totalBatches} batches, inProgress=${inProgress}, elementGrouped=${isElementGrouped}`
    );

    return NextResponse.json({
      inProgress,
      completed: completedBatches,
      total: totalBatches,
      batchGroupId: latestRun.batch_group_id,
      runs: runs || [],
    });
  } catch (error: any) {
    console.error('Error fetching assessment progress:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

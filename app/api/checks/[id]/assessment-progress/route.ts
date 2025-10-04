import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    // Get the latest batch group for this check
    const { data: latestRun } = await supabase
      .from('analysis_runs')
      .select('batch_group_id, total_batches')
      .eq('check_id', checkId)
      .order('executed_at', { ascending: false })
      .limit(1)
      .single();

    console.log(`[Progress] Check ${checkId}: latestRun =`, latestRun);

    if (!latestRun || !latestRun.batch_group_id) {
      // No runs yet - check if assessment was just started by looking at check status
      const { data: check } = await supabase
        .from('checks')
        .select('status')
        .eq('id', checkId)
        .single();

      console.log(`[Progress] Check ${checkId}: No runs found, check status =`, check?.status);

      // If check is processing, assume assessment is in progress (jobs queued but not processed yet)
      if (check?.status === 'processing') {
        return NextResponse.json({
          inProgress: true,
          completed: 0,
          total: 1, // We don't know total yet, but signal in-progress
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

    // Get all runs for this batch group
    const { data: runs } = await supabase
      .from('analysis_runs')
      .select('*')
      .eq('batch_group_id', latestRun.batch_group_id)
      .order('batch_number', { ascending: true });

    const totalBatches = latestRun.total_batches || 0;
    const completedBatches = runs?.length || 0;
    const inProgress = completedBatches < totalBatches;

    console.log(
      `[Progress] Check ${checkId}: ${completedBatches}/${totalBatches} batches, inProgress=${inProgress}`
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

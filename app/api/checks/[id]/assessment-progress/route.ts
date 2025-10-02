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

    if (!latestRun || !latestRun.batch_group_id) {
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

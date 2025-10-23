import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const checkId = searchParams.get('checkId');
  const batchGroupId = searchParams.get('batchGroupId');

  try {
    // Get queue length
    const queueLength = await kv.llen('queue:analysis');

    // Get all jobs in queue (first 50)
    const jobIds = await kv.lrange('queue:analysis', 0, 49);

    // Get job details
    const jobs = await Promise.all(
      jobIds.map(async id => {
        const job = await kv.hgetall(`job:${id}`);
        return { id, ...job };
      })
    );

    let checkInfo: any = null;
    let batchInfo = null;

    // If checkId provided, get check status and related jobs
    if (checkId) {
      const supabase = supabaseAdmin();
      const { data: check } = await supabase
        .from('checks')
        .select('*, element_groups(name)')
        .eq('id', checkId)
        .single();

      if (check) {
        // Get all sibling checks if element-grouped
        let checkIds = [checkId];
        if (check.element_group_id && check.instance_label) {
          const { data: siblings } = await supabase
            .from('checks')
            .select('id, code_section_number, status')
            .eq('assessment_id', check.assessment_id)
            .eq('element_group_id', check.element_group_id)
            .eq('instance_label', check.instance_label)
            .order('code_section_number');

          checkIds = siblings?.map(s => s.id) || [checkId];
          checkInfo = {
            check,
            siblings: siblings || [],
            totalSiblings: checkIds.length,
          };
        } else {
          checkInfo = { check, siblings: [], totalSiblings: 1 };
        }

        // Get analysis runs
        const { data: runs } = await supabase
          .from('analysis_runs')
          .select(
            'id, check_id, batch_group_id, batch_number, total_batches, compliance_status, executed_at'
          )
          .in('check_id', checkIds)
          .order('executed_at', { ascending: false })
          .limit(50);

        checkInfo.runs = runs || [];
        checkInfo.latestBatchGroupId = runs?.[0]?.batch_group_id;
      }
    }

    // If batchGroupId provided (or found from check), get batch status
    const targetBatchGroupId = batchGroupId || checkInfo?.latestBatchGroupId;
    if (targetBatchGroupId) {
      const supabase = supabaseAdmin();
      const { data: batchRuns } = await supabase
        .from('analysis_runs')
        .select('*')
        .eq('batch_group_id', targetBatchGroupId)
        .order('batch_number');

      batchInfo = {
        batchGroupId: targetBatchGroupId,
        runs: batchRuns || [],
        completed: batchRuns?.length || 0,
        total: batchRuns?.[0]?.total_batches || 0,
      };
    }

    // Get detailed info for jobs in queue
    const jobDetails = await Promise.all(
      jobIds.map(async id => {
        const job = await kv.hgetall(`job:${id}`);
        return { id, ...job };
      })
    );

    const jobsByStatus = {
      pending: jobDetails.filter(j => j.status === 'pending').length,
      processing: jobDetails.filter(j => j.status === 'processing').length,
      completed: jobDetails.filter(j => j.status === 'completed').length,
      failed: jobDetails.filter(j => j.status === 'failed').length,
      cancelled: jobDetails.filter(j => j.status === 'cancelled').length,
    };

    // Find stuck jobs (processing for more than 5 minutes)
    const now = Date.now();
    const stuckJobs = jobDetails.filter(j => {
      if (j.status !== 'processing') return false;
      const startedAt = j.startedAt ? parseInt(j.startedAt as string) : 0;
      return startedAt && now - startedAt > 5 * 60 * 1000;
    });

    return NextResponse.json({
      queue: {
        length: queueLength,
        jobs: jobs.slice(0, 20), // First 20 jobs in queue
      },
      jobStats: {
        total: jobDetails.length,
        byStatus: jobsByStatus,
        stuckJobs: stuckJobs.map(j => ({
          id: j.id,
          type: j.type,
          status: j.status,
          startedAt: j.startedAt,
          attempts: j.attempts,
        })),
      },
      checkInfo,
      batchInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching queue status:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch queue status' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ComplianceOverrideStatus } from '@/types/database';
import { kv } from '@/lib/kv';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { override, note } = body as { override: ComplianceOverrideStatus | null; note?: string };

    // Validate override value
    const validStatuses: (ComplianceOverrideStatus | null)[] = [
      'compliant',
      'non_compliant',
      'not_applicable',
      'insufficient_information',
      null,
    ];
    if (!validStatuses.includes(override)) {
      return NextResponse.json(
        {
          error:
            'Invalid override value. Must be "compliant", "non_compliant", "not_applicable", "insufficient_information", or null',
        },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // When setting a manual override (not clearing), cancel any pending analysis
    if (override) {
      console.log(`[ManualOverride] Cancelling pending analysis for check ${id}`);

      // 1. Update check status to stop polling
      await supabase.from('checks').update({ status: 'cancelled' }).eq('id', id);

      // 2. Get all pending job IDs from the queue
      const queueLength = await kv.llen('queue:analysis');
      console.log(`[ManualOverride] Queue length: ${queueLength}`);

      if (queueLength > 0) {
        // Get all job IDs from the queue
        const jobIds = await kv.lrange('queue:analysis', 0, queueLength - 1);
        console.log(`[ManualOverride] Checking ${jobIds.length} queued jobs`);

        // Check each job to see if it belongs to this check
        const jobsToCancel: string[] = [];
        for (const jobId of jobIds) {
          const job = await kv.hgetall<{ type: string; payload: string }>(`job:${jobId}`);
          if (job && job.payload) {
            const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
            if (payload.checkId === id) {
              jobsToCancel.push(jobId);
            }
          }
        }

        console.log(`[ManualOverride] Found ${jobsToCancel.length} jobs to cancel for check ${id}`);

        // Cancel the jobs
        for (const jobId of jobsToCancel) {
          // Mark job as cancelled
          await kv.hset(`job:${jobId}`, { status: 'cancelled', cancelledAt: Date.now() });
          // Remove from queue
          await kv.lrem('queue:analysis', 1, jobId);
          console.log(`[ManualOverride] Cancelled job ${jobId}`);
        }
      }
    }

    // Prepare update data
    const updateData: any = {
      manual_status: override,
      manual_status_note: note || null,
      manual_status_at: override ? new Date().toISOString() : null,
      // When setting override, ensure status is not 'processing'
      status: override ? 'completed' : undefined,
      // TODO: Add user tracking when auth is implemented
      // manual_status_by: user.id,
    };

    // Update the check
    const { data, error } = await supabase
      .from('checks')
      .update(updateData)
      .eq('id', id)
      .select('*');

    if (error) {
      console.error('Error updating manual override:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if the check was found and updated
    if (!data || data.length === 0) {
      console.warn(`Check ${id} not found - may have been deleted or excluded`);
      return NextResponse.json(
        { error: 'Check not found - it may have been deleted or excluded' },
        { status: 404 }
      );
    }

    return NextResponse.json({ check: data[0] });
  } catch (error: any) {
    console.error('Manual override API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

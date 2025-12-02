import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  const supabase = supabaseAdmin();

  console.log(
    '[GET /api/assessments/[id]/agent/status] Assessment:',
    assessmentId,
    'RunId:',
    runId
  );

  try {
    let query = supabase
      .from('agent_runs')
      .select('id, status, progress, started_at, completed_at, error, results, created_at')
      .eq('assessment_id', assessmentId);

    if (runId) {
      // Get specific run
      query = query.eq('id', runId);
    } else {
      // Get latest run
      query = query.order('created_at', { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      console.log('[agent/status] No agent run found');
      return NextResponse.json({ error: 'No agent run found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[agent/status] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

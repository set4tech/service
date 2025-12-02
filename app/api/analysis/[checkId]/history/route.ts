import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const supabase = supabaseAdmin();

  // Fetch from both tables in parallel
  const [aiResult, agentResult] = await Promise.all([
    supabase.from('analysis_runs').select('*').eq('check_id', checkId),
    supabase
      .from('agent_analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .eq('status', 'completed'),
  ]);

  if (aiResult.error) {
    return NextResponse.json({ error: aiResult.error.message }, { status: 500 });
  }

  // Merge both sources, add source indicator, sort by date
  const allRuns = [
    ...(aiResult.data || []).map(r => ({ ...r, source: 'ai' as const })),
    ...(agentResult.data || []).map(r => ({
      ...r,
      executed_at: r.completed_at,
      source: 'agent' as const,
    })),
  ].sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());

  return NextResponse.json({ runs: allRuns });
}

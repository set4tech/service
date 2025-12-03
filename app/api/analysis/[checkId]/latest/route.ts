import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const supabase = supabaseAdmin();

  // Fetch from both tables in parallel
  const [aiResult, agentResult] = await Promise.all([
    supabase
      .from('analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('agent_analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .eq('status', 'completed')
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (aiResult.error && agentResult.error) {
    return NextResponse.json({ error: aiResult.error.message }, { status: 404 });
  }

  const aiRun = aiResult.data;
  const agentRun = agentResult.data;

  // Return most recent from either table
  let latest = null;
  let source = null;

  if (!aiRun && !agentRun) {
    latest = null;
    source = null;
  } else if (!aiRun) {
    latest = { ...agentRun, executed_at: agentRun.completed_at };
    source = 'agent';
  } else if (!agentRun) {
    latest = aiRun;
    source = 'ai';
  } else {
    // Both exist - compare dates
    const aiDate = new Date(aiRun.executed_at);
    const agentDate = new Date(agentRun.completed_at);
    if (agentDate > aiDate) {
      latest = { ...agentRun, executed_at: agentRun.completed_at };
      source = 'agent';
    } else {
      latest = aiRun;
      source = 'ai';
    }
  }

  return NextResponse.json({ latest, source });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runAI } from '@/lib/ai/analysis';

export async function POST(req: NextRequest) {
  const { checkId, prompt, screenshots, provider } = await req.json();
  if (!checkId || !prompt || !provider) return NextResponse.json({ error: 'checkId, prompt, provider required' }, { status: 400 });

  const supabase = supabaseAdmin();

  // Compute next run_number atomically
  const { count } = await supabase.from('analysis_runs').select('*', { count: 'exact', head: true }).eq('check_id', checkId);
  const runNumber = (count || 0) + 1;

  const started = Date.now();
  try {
    const { model, raw, parsed } = await runAI({ prompt, screenshots: screenshots || [], provider });

    const execution_time_ms = Date.now() - started;
    const insert = {
      check_id: checkId,
      run_number: runNumber,
      compliance_status: parsed.compliance_status,
      confidence: parsed.confidence,
      ai_provider: provider,
      ai_model: model,
      ai_reasoning: parsed.reasoning || null,
      violations: parsed.violations || [],
      compliant_aspects: parsed.compliant_aspects || [],
      recommendations: parsed.recommendations || [],
      additional_evidence_needed: parsed.additional_evidence_needed || [],
      raw_ai_response: raw,
      execution_time_ms
    };

    const { data, error } = await supabase.from('analysis_runs').insert(insert).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark check status
    await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);

    return NextResponse.json({ run: data });
  } catch (e: any) {
    await supabase.from('checks').update({ status: 'failed' }).eq('id', checkId);
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 });
  }
}
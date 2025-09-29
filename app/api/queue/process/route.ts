import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runAI } from '@/lib/ai/analysis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jobs: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = await kv.rpop<string>('queue:analysis');
    if (!id) break;
    jobs.push(id);
  }
  if (jobs.length === 0) return NextResponse.json({ processed: 0 });

  const supabase = supabaseAdmin();

  for (const id of jobs) {
    try {
      const job = await kv.hgetall<{ payload: string; attempts: number }>(`job:${id}`);
      await kv.hset(`job:${id}`, { status: 'processing', startedAt: Date.now(), attempts: (job?.attempts || 0) + 1 });

      const payload = JSON.parse(job!.payload);
      const { checkId, prompt, screenshots, provider } = payload;

      // next run number
      const { count } = await supabase.from('analysis_runs').select('*', { count: 'exact', head: true }).eq('check_id', checkId);
      const runNumber = (count || 0) + 1;

      const started = Date.now();
      const { model, raw, parsed } = await runAI({ prompt, screenshots: screenshots || [], provider });
      const execution_time_ms = Date.now() - started;

      const { error } = await supabase.from('analysis_runs').insert({
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
      });
      if (error) throw new Error(error.message);

      await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);
      await kv.hset(`job:${id}`, { status: 'completed', completedAt: Date.now() });
    } catch (e: any) {
      const job = await kv.hgetall<{ attempts: number; maxAttempts: number }>(`job:${id}`);
      const attempts = job?.attempts || 1;
      const maxAttempts = job?.maxAttempts || 3;
      if (attempts < maxAttempts) {
        await kv.hset(`job:${id}`, { status: 'pending' });
        await kv.lpush('queue:analysis', id);
      } else {
        await kv.hset(`job:${id}`, { status: 'failed', error: String(e?.message || e) });
      }
    }
  }

  return NextResponse.json({ processed: jobs.length });
}
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
      const job = await kv.hgetall<{ type: string; payload: string; attempts: number }>(
        `job:${id}`
      );
      await kv.hset(`job:${id}`, {
        status: 'processing',
        startedAt: Date.now(),
        attempts: (job?.attempts || 0) + 1,
      });

      const payload = JSON.parse(job!.payload);
      const jobType = job?.type || 'analysis';

      if (jobType === 'batch_analysis') {
        // Handle batch analysis jobs
        const {
          checkId,
          batch,
          batchNum,
          totalBatches,
          batchGroupId,
          runNumber,
          screenshotUrls,
          screenshots,
          check,
          buildingContext,
          customPrompt,
          extraContext,
          provider,
          modelName,
        } = payload;

        // Build prompt
        const sectionsText = batch
          .map((s: any) => `## Section ${s.number} - ${s.title}\n\n${s.text}`)
          .join('\n\n---\n\n');

        let prompt = customPrompt;
        if (!prompt) {
          const screenshotsSection =
            screenshots && screenshots.length > 0
              ? `# Evidence (Screenshots)\nProvided ${screenshots.length} screenshot(s) showing relevant documentation.`
              : '# Evidence\nNo screenshots provided. Base assessment on building information and code requirements.';

          const extraContextSection = extraContext
            ? `\n\n# Additional Context\n${extraContext}`
            : '';

          prompt = `You are an expert building code compliance analyst. Your task is to assess whether the provided project demonstrates compliance with the following building code sections.

# Building Code Sections (Batch ${batchNum} of ${totalBatches})
${sectionsText}

# Project Information
${JSON.stringify(buildingContext, null, 2)}

# Check Details
Location: ${check.check_location || 'Not specified'}
Check: ${check.check_name || 'Compliance check'}${extraContextSection}

${screenshotsSection}

# Your Task
Analyze the evidence and determine compliance for ALL sections above:
1. Compliance status: Must be one of: "compliant", "violation", "needs_more_info"
2. Confidence level: "high", "medium", or "low"
3. Reasoning for your determination across all sections
4. Any violations found (if applicable)
5. Recommendations (if applicable)

Return your response as a JSON object with this exact structure:
{
  "compliance_status": "compliant" | "violation" | "needs_more_info",
  "confidence": "high" | "medium" | "low",
  "reasoning": "your detailed reasoning here",
  "violations": [{"description": "...", "severity": "minor"|"moderate"|"major"}],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;
        }

        // Call AI
        const started = Date.now();
        const { model, raw, parsed } = await runAI({
          prompt,
          screenshots: screenshotUrls || [],
          provider,
          model: modelName,
        });
        const executionTimeMs = Date.now() - started;

        // Save analysis run with batch metadata
        const { error } = await supabase.from('analysis_runs').insert({
          check_id: checkId,
          run_number: runNumber,
          batch_group_id: batchGroupId,
          batch_number: batchNum,
          total_batches: totalBatches,
          section_keys_in_batch: batch.map((s: any) => s.key),
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
          execution_time_ms: executionTimeMs,
        });
        if (error) throw new Error(error.message);

        // Check if all batches are complete
        const { data: allRuns } = await supabase
          .from('analysis_runs')
          .select('compliance_status')
          .eq('batch_group_id', batchGroupId);

        if (allRuns && allRuns.length === totalBatches) {
          // All batches complete - update check status
          await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);
        }

        console.log(`[Queue] Completed batch ${batchNum}/${totalBatches} for check ${checkId}`);
      } else {
        // Handle legacy single analysis jobs
        const { checkId, prompt, screenshots, provider } = payload;

        // next run number
        const { count } = await supabase
          .from('analysis_runs')
          .select('*', { count: 'exact', head: true })
          .eq('check_id', checkId);
        const runNumber = (count || 0) + 1;

        const started = Date.now();
        const { model, raw, parsed } = await runAI({
          prompt,
          screenshots: screenshots || [],
          provider,
        });
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
          execution_time_ms,
        });
        if (error) throw new Error(error.message);

        await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);
      }

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

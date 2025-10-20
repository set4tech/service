import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runAI } from '@/lib/ai/analysis';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('[Queue] Processing started at', new Date().toISOString());

  const jobs: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = await kv.rpop<string>('queue:analysis');
    if (!id) break;
    jobs.push(id);
  }

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  console.log(`[Queue] Processing ${jobs.length} job(s)`);
  const supabase = supabaseAdmin();

  for (const id of jobs) {
    try {
      console.log(`[Queue] Processing job ${id}`);
      const job = await kv.hgetall<{
        type: string;
        payload: string;
        attempts: number;
        status: string;
      }>(`job:${id}`);

      if (!job) {
        console.error(`[Queue] Job ${id} not found in KV store`);
        continue;
      }

      // Skip cancelled jobs
      if (job.status === 'cancelled') {
        console.log(`[Queue] Job ${id} was cancelled, skipping`);
        continue;
      }

      console.log(`[Queue] Job ${id} type: ${job.type}, attempt ${(job.attempts || 0) + 1}`);

      await kv.hset(`job:${id}`, {
        status: 'processing',
        startedAt: Date.now(),
        attempts: (job?.attempts || 0) + 1,
      });

      // payload is already parsed by hgetall
      const payload = typeof job!.payload === 'string' ? JSON.parse(job!.payload) : job!.payload;
      const jobType = job?.type || 'analysis';

      if (jobType === 'element_group_assessment') {
        // Handle element group meta-job: expand into individual batch_analysis jobs
        console.log(`[Queue] Expanding element_group_assessment job ${id}`);

        const {
          checkIds,
          batchGroupId,
          totalBatches,
          screenshotUrls,
          screenshots,
          buildingContext,
          customPrompt,
          extraContext,
          provider,
          modelName,
          assessmentId: _assessmentId,
          elementGroupId: _elementGroupId,
          instanceLabel,
        } = payload;

        // Fetch all checks with their section info
        const { data: checks } = await supabase
          .from('checks')
          .select('id, code_section_key, code_section_number, code_section_title')
          .in('id', checkIds)
          .order('code_section_number', { ascending: true });

        if (!checks || checks.length === 0) {
          throw new Error(`No checks found for element group job ${id}`);
        }

        console.log(`[Queue] Creating ${checks.length} batch jobs for element "${instanceLabel}"`);

        // Fetch all sections in parallel
        const sectionKeys = checks.map(c => c.code_section_key);
        const { data: sections } = await supabase
          .from('sections')
          .select('key, number, title, text, paragraphs')
          .in('key', sectionKeys)
          .eq('never_relevant', false);

        const sectionMap = new Map(sections?.map(s => [s.key, s]) || []);

        // Fetch all references for these sections
        console.log(`[Queue] Fetching references for ${sectionKeys.length} sections`);
        const { data: references } = await supabase
          .from('section_references')
          .select('source_section_key, target_section_key')
          .in('source_section_key', sectionKeys);

        // Get all unique referenced section keys
        const referencedKeys = Array.from(
          new Set(references?.map(r => r.target_section_key) || [])
        );
        console.log(`[Queue] Found ${referencedKeys.length} unique referenced sections`);

        // Fetch the actual referenced section content
        let referencedSections: any[] = [];
        if (referencedKeys.length > 0) {
          const { data: refSections } = await supabase
            .from('sections')
            .select('key, number, title, text, paragraphs')
            .in('key', referencedKeys)
            .eq('never_relevant', false);
          referencedSections = refSections || [];
        }

        // Build maps for easy lookup
        const referencedSectionMap = new Map(referencedSections.map(s => [s.key, s]));
        const referencesMap = new Map<string, string[]>();

        // Group references by source section
        references?.forEach(ref => {
          if (!referencesMap.has(ref.source_section_key)) {
            referencesMap.set(ref.source_section_key, []);
          }
          referencesMap.get(ref.source_section_key)!.push(ref.target_section_key);
        });

        // Get run counts for all checks in parallel
        const runCountPromises = checks.map(c =>
          supabase
            .from('analysis_runs')
            .select('*', { count: 'exact', head: true })
            .eq('check_id', c.id)
            .then(({ count }) => ({ checkId: c.id, count: count || 0 }))
        );
        const runCounts = await Promise.all(runCountPromises);
        const runCountMap = Object.fromEntries(runCounts.map(r => [r.checkId, r.count]));

        // Create individual batch_analysis jobs
        for (let i = 0; i < checks.length; i++) {
          const check = checks[i];
          const batchNum = i + 1;
          const section = sectionMap.get(check.code_section_key);

          let codeSection: any;
          if (section) {
            const paragraphs = section.paragraphs || [];
            const paragraphsText = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';

            // Get referenced sections for this section
            const refKeys = referencesMap.get(section.key) || [];
            const references = refKeys
              .map(refKey => {
                const refSection = referencedSectionMap.get(refKey);
                if (refSection) {
                  const refParagraphs = refSection.paragraphs || [];
                  const refParagraphsText = Array.isArray(refParagraphs)
                    ? refParagraphs.join('\n\n')
                    : '';
                  return {
                    key: refSection.key,
                    number: refSection.number,
                    title: refSection.title,
                    text: refSection.text || '',
                    paragraphs: refParagraphsText,
                  };
                }
                return null;
              })
              .filter(r => r !== null);

            codeSection = {
              key: section.key,
              number: section.number || '',
              title: section.title || '',
              text: section.text || '',
              paragraphs: paragraphsText,
              references,
            };
          } else {
            codeSection = {
              key: check.code_section_key || 'unknown',
              number: check.code_section_number || '',
              title: check.code_section_title || '',
              text: 'Section text not available',
              paragraphs: '',
              references: [],
            };
          }

          const runNumber = runCountMap[check.id] + 1;
          const childJobId = crypto.randomUUID();

          await kv.hset(`job:${childJobId}`, {
            id: childJobId,
            type: 'batch_analysis',
            payload: JSON.stringify({
              checkId: check.id,
              batch: [codeSection],
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
            }),
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            createdAt: Date.now(),
          });
          await kv.lpush('queue:analysis', childJobId);
        }

        console.log(
          `[Queue] Successfully expanded element_group_assessment job ${id} into ${checks.length} batch jobs`
        );

        // Mark meta-job as completed
        await kv.hset(`job:${id}`, {
          status: 'completed',
          completedAt: Date.now(),
        });
      } else if (jobType === 'batch_analysis') {
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

        // Check if manual override exists - if so, skip this job
        const { data: checkData } = await supabase
          .from('checks')
          .select('manual_status, status, check_type')
          .eq('id', checkId)
          .single();

        if (checkData?.manual_status) {
          console.log(`[Queue] Check ${checkId} has manual override, skipping analysis job ${id}`);
          await kv.hset(`job:${id}`, {
            status: 'cancelled',
            cancelledAt: Date.now(),
            cancelReason: 'manual_status_set',
          });
          continue;
        }

        if (checkData?.status === 'cancelled') {
          console.log(`[Queue] Check ${checkId} has been cancelled, skipping analysis job ${id}`);
          await kv.hset(`job:${id}`, {
            status: 'cancelled',
            cancelledAt: Date.now(),
            cancelReason: 'check_cancelled',
          });
          continue;
        }

        // Build prompt with main sections and their references
        const sectionsText = batch
          .map((s: any) => {
            let text = `## Section ${s.number} - ${s.title}\n\n`;

            // Add section summary if available
            if (s.text) {
              text += `### Section Summary\n${s.text}\n\n`;
            }

            // Add section paragraphs/requirements
            if (s.paragraphs) {
              text += `### Requirements\n${s.paragraphs}\n\n`;
            }

            // Add referenced sections if any
            if (s.references && s.references.length > 0) {
              text += `### Referenced Code Sections (must be satisfied for compliance):\n\n`;

              s.references.forEach((ref: any) => {
                text += `#### ${ref.number} - ${ref.title}\n`;
                if (ref.text) {
                  text += `${ref.text}\n\n`;
                }
                if (ref.paragraphs) {
                  text += `${ref.paragraphs}\n\n`;
                }
              });
            }

            return text.trim();
          })
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
Analyze the evidence and provide a compliance assessment for EACH section individually.

For each section, determine:
1. **compliance_status**: Must be one of:
   - "compliant": Clear evidence that requirements are met
   - "non_compliant": Clear evidence of code violation
   - "needs_more_info": Information that SHOULD be shown is missing (e.g., missing dimensions that should be on the plan)
   - "not_applicable": Section is not relevant to this drawing type or project scope (e.g., signage details on floor plans, mounting heights not typically shown)

2. **confidence**: "high", "medium", or "low" (use "n/a" for not_applicable sections)

3. **reasoning**: Brief (1-2 sentences) explanation specific to THIS section

Guidelines:
- **IMPORTANT**: When a section includes "Referenced Code Sections", you MUST assess compliance with BOTH the main section AND all referenced sections. A section is only compliant if ALL requirements (including referenced sections) are met.
- Referenced sections provide critical details (e.g., mounting heights, clearances, force requirements) that are required for compliance.
- Use "not_applicable" generously for items not typically shown on architectural floor plans (signage, finish schedules, detailed mounting heights, etc.)
- Use "needs_more_info" ONLY when information SHOULD be present but is missing
- Be specific and concise in your reasoning
- If you find violations, note them clearly with severity and specify whether the violation is in the main section or a referenced section

Return your response as a JSON object with this exact structure:
{
  "sections": [
    {
      "section_key": "the section key exactly as provided",
      "section_number": "the section number",
      "compliance_status": "compliant" | "non_compliant" | "needs_more_info" | "not_applicable",
      "confidence": "high" | "medium" | "low" | "n/a",
      "reasoning": "brief explanation",
      "violations": [{"description": "...", "severity": "minor"|"moderate"|"major"}],
      "recommendations": ["..."]
    }
  ],
  "overall_summary": "brief summary of key findings across all sections"
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

        // Parse section-level results if available
        const sectionResults = parsed.sections || [];

        // Calculate overall status from section results
        let overallStatus = 'compliant';
        let overallConfidence = 'high';
        const allViolations: any[] = [];
        const allRecommendations: any[] = [];

        if (sectionResults.length > 0) {
          // Determine overall status: non_compliant > needs_more_info > compliant > not_applicable
          const hasViolation = sectionResults.some(
            (s: any) => s.compliance_status === 'non_compliant'
          );
          const hasNeedsMoreInfo = sectionResults.some(
            (s: any) => s.compliance_status === 'needs_more_info'
          );
          const allNotApplicable = sectionResults.every(
            (s: any) => s.compliance_status === 'not_applicable'
          );

          if (hasViolation) {
            overallStatus = 'non_compliant';
          } else if (hasNeedsMoreInfo) {
            overallStatus = 'needs_more_info';
          } else if (allNotApplicable) {
            overallStatus = 'not_applicable';
          } else {
            overallStatus = 'compliant';
          }

          // Aggregate violations and recommendations
          sectionResults.forEach((s: any) => {
            if (s.violations && s.violations.length > 0) {
              allViolations.push(
                ...s.violations.map((v: any) => ({
                  ...v,
                  section_number: s.section_number,
                }))
              );
            }
            if (s.recommendations && s.recommendations.length > 0) {
              allRecommendations.push(...s.recommendations);
            }
          });

          // Set confidence based on section confidences
          const confidenceLevels = sectionResults
            .filter((s: any) => s.confidence !== 'n/a')
            .map((s: any) => s.confidence);
          if (confidenceLevels.includes('low')) {
            overallConfidence = 'low';
          } else if (confidenceLevels.includes('medium')) {
            overallConfidence = 'medium';
          }
        } else {
          // Fallback to old format if sections not provided
          overallStatus = parsed.compliance_status || 'needs_more_info';
          overallConfidence = parsed.confidence || 'medium';
          if (parsed.violations) allViolations.push(...parsed.violations);
          if (parsed.recommendations) allRecommendations.push(...parsed.recommendations);
        }

        // Save analysis run with batch metadata
        const { error } = await supabase.from('analysis_runs').insert({
          check_id: checkId,
          run_number: runNumber,
          batch_group_id: batchGroupId,
          batch_number: batchNum,
          total_batches: totalBatches,
          section_keys_in_batch: batch.map((s: any) => s.key),
          section_results: sectionResults.length > 0 ? sectionResults : null,
          compliance_status: overallStatus,
          confidence: overallConfidence,
          ai_provider: provider,
          ai_model: model,
          ai_reasoning: parsed.overall_summary || parsed.reasoning || null,
          violations: allViolations,
          compliant_aspects: parsed.compliant_aspects || [],
          recommendations: allRecommendations,
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
      console.log(`[Queue] Job ${id} completed successfully`);
    } catch (e: any) {
      console.error(`[Queue] Job ${id} failed:`, e?.message || e);
      const job = await kv.hgetall<{ attempts: number; maxAttempts: number }>(`job:${id}`);
      const attempts = job?.attempts || 1;
      const maxAttempts = job?.maxAttempts || 3;
      if (attempts < maxAttempts) {
        console.log(`[Queue] Job ${id} retrying (attempt ${attempts}/${maxAttempts})`);
        await kv.hset(`job:${id}`, { status: 'pending' });
        await kv.lpush('queue:analysis', id);
      } else {
        console.error(`[Queue] Job ${id} failed permanently after ${attempts} attempts`);
        await kv.hset(`job:${id}`, { status: 'failed', error: String(e?.message || e) });
      }
    }
  }

  console.log(`[Queue] Processed ${jobs.length} jobs`);
  return NextResponse.json({ processed: jobs.length });
}

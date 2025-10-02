import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runAI } from '@/lib/ai/analysis';
import { getCodeAssembly } from '@/lib/neo4j';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Helper to extract S3 key from s3:// URL
function getS3Key(url: string): string {
  if (url.startsWith('s3://')) {
    const parts = url.replace('s3://', '').split('/');
    parts.shift(); // Remove bucket name
    return parts.join('/');
  }
  return url;
}

// Helper to generate presigned URL for viewing
async function getPresignedUrl(s3Url: string): Promise<string> {
  const key = getS3Key(s3Url);
  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn: 3600 }
  );
}

// Map user-friendly model names to provider and specific model
function getModelConfig(model: string): {
  provider: 'gemini' | 'openai' | 'anthropic';
  modelName: string;
} {
  switch (model) {
    case 'gemini-2.5-pro':
      return { provider: 'gemini', modelName: 'gemini-2.5-pro' };
    case 'gemini-2.5-flash':
      return { provider: 'gemini', modelName: 'gemini-2.5-flash' };
    case 'claude-opus-4':
      return { provider: 'anthropic', modelName: 'claude-opus-4-20250514' };
    case 'gpt-4o':
      return { provider: 'openai', modelName: 'gpt-4o' };
    default:
      return { provider: 'gemini', modelName: 'gemini-2.5-pro' };
  }
}

// Background processing function
async function processRemainingBatches(
  checkId: string,
  batches: any[][],
  startingBatchIndex: number,
  screenshotUrls: string[],
  screenshots: any[],
  check: any,
  buildingContext: any,
  customPrompt: string | undefined,
  extraContext: string | undefined,
  provider: 'gemini' | 'openai' | 'anthropic',
  modelName: string,
  batchGroupId: string,
  startingRunNumber: number
) {
  const supabase = supabaseAdmin();

  for (let batchIndex = startingBatchIndex; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;

    try {
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

        const extraContextSection = extraContext ? `\n\n# Additional Context\n${extraContext}` : '';

        prompt = `You are an expert building code compliance analyst. Your task is to assess whether the provided project demonstrates compliance with the following building code sections.

# Building Code Sections (Batch ${batchNum} of ${batches.length})
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
        screenshots: screenshotUrls,
        provider,
        model: modelName,
      });
      const executionTimeMs = Date.now() - started;

      // Create and save analysis run
      const analysisRun = {
        check_id: checkId,
        run_number: startingRunNumber + batchIndex,
        batch_group_id: batchGroupId,
        batch_number: batchNum,
        total_batches: batches.length,
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
      };

      await supabase.from('analysis_runs').insert(analysisRun);

      console.log(`[Background] Completed batch ${batchNum}/${batches.length} for check ${checkId}`);
    } catch (error) {
      console.error(`[Background] Error processing batch ${batchNum}:`, error);
      // Continue with next batch even if this one fails
    }
  }

  // Update check status when all batches complete
  const { data: allRuns } = await supabase
    .from('analysis_runs')
    .select('compliance_status')
    .eq('batch_group_id', batchGroupId);

  let overallStatus = 'compliant';
  if (allRuns) {
    const hasViolation = allRuns.some(r => r.compliance_status === 'violation');
    const needsInfo = allRuns.some(r => r.compliance_status === 'needs_more_info');

    if (hasViolation) {
      overallStatus = 'violation';
    } else if (needsInfo) {
      overallStatus = 'needs_more_info';
    }
  }

  await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);

  console.log(`[Background] Assessment complete for check ${checkId}: ${overallStatus}`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const { aiProvider, customPrompt, extraContext } = await req.json();

  if (!aiProvider) {
    return NextResponse.json({ error: 'aiProvider required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    // 1. Fetch check from DB
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select('*, assessments(project_id, projects(extracted_variables, code_assembly_id))')
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    // 2. Get project variables
    const assessment = check.assessments as any;
    const project = assessment?.projects;
    const buildingContext = project?.extracted_variables || {};
    const codeAssemblyId = project?.code_assembly_id;

    // 3. Fetch code sections from Neo4j
    const sectionKeys = check.element_sections || (check.code_section_key ? [check.code_section_key] : []);
    const codeSections: any[] = [];

    if (sectionKeys.length > 0 && codeAssemblyId) {
      const assembly = await getCodeAssembly(codeAssemblyId);
      for (const key of sectionKeys) {
        const section = assembly.sections?.find((s: any) => s.key === key);
        if (section) {
          codeSections.push({
            key,
            number: section.number || '',
            title: section.title || '',
            text: section.fullText || 'Section text not available',
          });
        }
      }
    }

    if (codeSections.length === 0) {
      codeSections.push({
        key: check.code_section_key || 'unknown',
        number: check.code_section_number || '',
        title: check.code_section_title || '',
        text: 'Section text not available from code assembly',
      });
    }

    // 4. Fetch all screenshots with presigned URLs
    const { data: screenshots, error: screenshotsError } = await supabase
      .from('screenshots')
      .select('screenshot_url, caption')
      .eq('check_id', checkId)
      .order('created_at', { ascending: true });

    if (screenshotsError) {
      return NextResponse.json({ error: 'Failed to fetch screenshots' }, { status: 500 });
    }

    const screenshotUrls = await Promise.all(
      (screenshots || []).map(async s => await getPresignedUrl(s.screenshot_url))
    );

    // 5. Batch sections (30 per batch)
    const BATCH_SIZE = 30;
    const batches: any[][] = [];
    for (let i = 0; i < codeSections.length; i += BATCH_SIZE) {
      batches.push(codeSections.slice(i, i + BATCH_SIZE));
    }

    const batchGroupId = crypto.randomUUID();

    // 6. Get starting run number
    const { count } = await supabase
      .from('analysis_runs')
      .select('*', { count: 'exact', head: true })
      .eq('check_id', checkId);
    const runNumber = (count || 0) + 1;

    // 7. Process FIRST batch synchronously
    const { provider, modelName } = getModelConfig(aiProvider);
    const firstBatch = batches[0];

    if (!firstBatch) {
      return NextResponse.json({ error: 'No sections to assess' }, { status: 400 });
    }

    // Build prompt for first batch
    const sectionsText = firstBatch
      .map(s => `## Section ${s.number} - ${s.title}\n\n${s.text}`)
      .join('\n\n---\n\n');

    let prompt = customPrompt;
    if (!prompt) {
      const screenshotsSection =
        screenshots && screenshots.length > 0
          ? `# Evidence (Screenshots)\nProvided ${screenshots.length} screenshot(s) showing relevant documentation.`
          : '# Evidence\nNo screenshots provided. Base assessment on building information and code requirements.';

      const extraContextSection = extraContext ? `\n\n# Additional Context\n${extraContext}` : '';

      prompt = `You are an expert building code compliance analyst. Your task is to assess whether the provided project demonstrates compliance with the following building code sections.

# Building Code Sections (Batch 1 of ${batches.length})
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

    // Call AI for first batch
    const started = Date.now();
    const { model, raw, parsed } = await runAI({
      prompt,
      screenshots: screenshotUrls,
      provider,
      model: modelName,
    });
    const executionTimeMs = Date.now() - started;

    // Save first batch result
    const firstRun = {
      check_id: checkId,
      run_number: runNumber,
      batch_group_id: batchGroupId,
      batch_number: 1,
      total_batches: batches.length,
      section_keys_in_batch: firstBatch.map(s => s.key),
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
    };

    const { data: savedRun, error: insertError } = await supabase
      .from('analysis_runs')
      .insert(firstRun)
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 8. If multiple batches, start background processing
    if (batches.length > 1) {
      processRemainingBatches(
        checkId,
        batches,
        1, // Start from batch index 1 (second batch)
        screenshotUrls,
        screenshots,
        check,
        buildingContext,
        customPrompt,
        extraContext,
        provider,
        modelName,
        batchGroupId,
        runNumber
      ).catch(error => {
        console.error('[Background] Processing error:', error);
      });
    } else {
      // Single batch - mark as completed immediately
      await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);
    }

    // Return immediately with first batch result
    return NextResponse.json({
      success: true,
      batchGroupId,
      totalBatches: batches.length,
      firstBatchResult: savedRun,
      message: batches.length > 1
        ? `First batch complete. Processing ${batches.length - 1} more batches in background.`
        : 'Assessment complete.',
    });
  } catch (error: any) {
    console.error('Assessment error:', error);
    await supabase.from('checks').update({ status: 'failed' }).eq('id', checkId);
    return NextResponse.json({ error: error?.message || 'Assessment failed' }, { status: 500 });
  }
}

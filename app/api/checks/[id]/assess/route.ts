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
function getModelConfig(model: string): { provider: 'gemini' | 'openai' | 'anthropic'; modelName: string } {
  switch (model) {
    case 'gemini-2.5-pro':
      return { provider: 'gemini', modelName: 'gemini-2.5-pro' };
    case 'claude-opus-4':
      return { provider: 'anthropic', modelName: 'claude-opus-4-20250514' };
    case 'gpt-4o':
      return { provider: 'openai', modelName: 'gpt-4o' };
    default:
      return { provider: 'gemini', modelName: 'gemini-2.5-pro' };
  }
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

    // 3. Fetch code section text from Neo4j
    let codeSectionText = '';
    let codeSectionData: any = null;

    if (check.code_section_key && codeAssemblyId) {
      const assembly = await getCodeAssembly(codeAssemblyId);
      const section = assembly.sections?.find((s: any) => s.key === check.code_section_key);
      if (section) {
        codeSectionText = section.fullText || '';
        codeSectionData = {
          number: section.number || check.code_section_number || '',
          title: section.title || check.code_section_title || '',
          text: codeSectionText,
        };
      }
    }

    // Fallback if Neo4j doesn't have the section
    if (!codeSectionData) {
      codeSectionData = {
        number: check.code_section_number || '',
        title: check.code_section_title || '',
        text: 'Section text not available from code assembly',
      };
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
      (screenshots || []).map(async (s) => await getPresignedUrl(s.screenshot_url))
    );

    // 5. Build the prompt
    let prompt = customPrompt;
    if (!prompt) {
      // Default prompt template
      const screenshotsSection =
        screenshots && screenshots.length > 0
          ? `# Evidence (Screenshots)\nProvided ${screenshots.length} screenshot(s) showing relevant documentation.`
          : '# Evidence\nNo screenshots provided. Base assessment on building information and code requirements.';

      const extraContextSection = extraContext ? `\n\n# Additional Context\n${extraContext}` : '';

      prompt = `You are an expert building code compliance analyst. Your task is to assess whether the provided project demonstrates compliance with a specific building code section.

# Building Code Section
Section: ${codeSectionData.number} - ${codeSectionData.title}

${codeSectionData.text}

# Project Information
${JSON.stringify(buildingContext, null, 2)}

# Check Details
Location: ${check.check_location || 'Not specified'}
Check: ${check.check_name || 'Compliance check'}${extraContextSection}

${screenshotsSection}

# Your Task
Analyze the evidence and determine:
1. Compliance status: Must be one of: "compliant", "violation", "needs_more_info"
2. Confidence level: "high", "medium", or "low"
3. Reasoning for your determination
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

    // 6. Get next run number
    const { count } = await supabase
      .from('analysis_runs')
      .select('*', { count: 'exact', head: true })
      .eq('check_id', checkId);
    const runNumber = (count || 0) + 1;

    // 7. Call AI provider
    const { provider, modelName } = getModelConfig(aiProvider);
    const started = Date.now();

    const { model, raw, parsed } = await runAI({
      prompt,
      screenshots: screenshotUrls,
      provider,
      model: modelName,
    });

    const executionTimeMs = Date.now() - started;

    // 8. Save to analysis_runs
    const analysisRun = {
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
      execution_time_ms: executionTimeMs,
    };

    const { data: savedRun, error: insertError } = await supabase
      .from('analysis_runs')
      .insert(analysisRun)
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 9. Update check status
    await supabase.from('checks').update({ status: 'completed' }).eq('id', checkId);

    return NextResponse.json({ success: true, analysisRun: savedRun });
  } catch (error: any) {
    console.error('Assessment error:', error);
    await supabase.from('checks').update({ status: 'failed' }).eq('id', checkId);
    return NextResponse.json({ error: error?.message || 'Assessment failed' }, { status: 500 });
  }
}

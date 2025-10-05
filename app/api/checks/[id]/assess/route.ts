import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { kv } from '@/lib/kv';

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const { aiProvider, customPrompt, extraContext } = await req.json();

  console.log(`[Assess] POST received for check ${checkId}, provider: ${aiProvider}`);

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

    // 3. Fetch code sections from Supabase
    const sectionKeys =
      check.element_sections || (check.code_section_key ? [check.code_section_key] : []);
    const codeSections: any[] = [];

    if (sectionKeys.length > 0) {
      const { data: sections, error: sectionsError } = await supabase
        .from('sections')
        .select('key, number, title, paragraphs')
        .in('key', sectionKeys)
        .eq('never_relevant', false);

      if (!sectionsError && sections) {
        for (const section of sections) {
          const paragraphs = section.paragraphs || [];
          const text = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';

          codeSections.push({
            key: section.key,
            number: section.number || '',
            title: section.title || '',
            text: text || 'Section text not available',
          });
        }
      }
    }

    if (codeSections.length === 0) {
      codeSections.push({
        key: check.code_section_key || 'unknown',
        number: check.code_section_number || '',
        title: check.code_section_title || '',
        text: 'Section text not available - no sections found',
      });
    }

    // 4. Fetch all screenshots with presigned URLs
    const { data: screenshotData, error: screenshotsError } = await supabase
      .from('screenshots')
      .select(
        `
        screenshot_url,
        caption,
        screenshot_check_assignments!inner(check_id)
      `
      )
      .eq('screenshot_check_assignments.check_id', checkId)
      .order('created_at', { ascending: true });

    const screenshots = screenshotData?.map((s: any) => ({
      screenshot_url: s.screenshot_url,
      caption: s.caption,
    }));

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

    console.log(
      `[Assess] Check ${checkId}: Found ${codeSections.length} sections, creating ${batches.length} batches`
    );

    const batchGroupId = crypto.randomUUID();

    // 6. Get starting run number
    const { count } = await supabase
      .from('analysis_runs')
      .select('*', { count: 'exact', head: true })
      .eq('check_id', checkId);
    const runNumber = (count || 0) + 1;

    // 7. Queue ALL batches in background (including the first one)
    const { provider, modelName } = getModelConfig(aiProvider);

    if (batches.length === 0) {
      return NextResponse.json({ error: 'No sections to assess' }, { status: 400 });
    }

    // Queue all batches as background jobs
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;
      const jobId = crypto.randomUUID();

      console.log(
        `[Assess] Queuing batch ${batchNum}/${batches.length} for check ${checkId}, jobId ${jobId}`
      );

      await kv.hset(`job:${jobId}`, {
        id: jobId,
        type: 'batch_analysis',
        payload: JSON.stringify({
          checkId,
          batch,
          batchNum,
          totalBatches: batches.length,
          batchGroupId,
          runNumber: runNumber + batchIndex,
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
      await kv.lpush('queue:analysis', jobId);
      console.log(`[Assess] Queued job ${jobId} to queue:analysis`);
    }

    console.log(
      `[Assess] Successfully queued ${batches.length} batches for check ${checkId}, batchGroupId ${batchGroupId}`
    );

    // Mark check as processing
    await supabase.from('checks').update({ status: 'processing' }).eq('id', checkId);

    // Immediately trigger queue processing (non-blocking)
    // Use VERCEL_URL in production/preview, or construct from request
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    fetch(`${baseUrl}/api/queue/process`, {
      method: 'GET',
    }).catch(err => console.error('Failed to trigger queue processing:', err));

    // Return immediately - all batches are queued
    return NextResponse.json({
      success: true,
      batchGroupId,
      totalBatches: batches.length,
      message: `Assessment queued. Processing ${batches.length} batch${batches.length > 1 ? 'es' : ''} in background.`,
    });
  } catch (error: any) {
    console.error('=== ASSESSMENT ERROR ===');
    console.error('Check ID:', checkId);
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    console.error('========================');

    await supabase.from('checks').update({ status: 'failed' }).eq('id', checkId);

    return NextResponse.json(
      {
        error: error?.message || 'Assessment failed',
        errorType: error?.constructor?.name,
        stack: error?.stack,
        details: error,
      },
      { status: 500 }
    );
  }
}

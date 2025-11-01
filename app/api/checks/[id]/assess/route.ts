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

    console.log(`[Assess] Check loaded:`, {
      checkId,
      elementGroupId: check.element_group_id,
      instanceLabel: check.instance_label,
      instanceNumber: check.instance_number,
      parentCheckId: check.parent_check_id,
      sectionId: check.section_id,
    });

    // 2. Get project variables
    const assessment = check.assessments as any;
    const project = assessment?.projects;
    const buildingContext = project?.extracted_variables || {};

    // 3. Check if this is an element-grouped check
    const isElementGrouped = !!check.element_group_id && !!check.instance_label;
    console.log(`[Assess] Is element-grouped check: ${isElementGrouped}`, {
      elementGroupId: check.element_group_id,
      instanceLabel: check.instance_label,
    });

    let sectionChecks: any[] = [check]; // Default to just this check
    if (isElementGrouped) {
      // Find all section checks that belong to this element instance
      const { data: siblings, error: siblingsError } = await supabase
        .from('checks')
        .select('id, section_id, code_section_number, code_section_title, assessment_id')
        .eq('assessment_id', check.assessment_id)
        .eq('element_group_id', check.element_group_id)
        .eq('instance_label', check.instance_label)
        .order('code_section_number', { ascending: true })
        .limit(10000); // Override Supabase default limit

      if (!siblingsError && siblings && siblings.length > 0) {
        sectionChecks = siblings;
        console.log(
          `[Assess] Found ${sectionChecks.length} section checks for element "${check.instance_label}"`
        );
      } else {
        console.log(`[Assess] No siblings found, error:`, siblingsError);
      }
    }

    console.log(`[Assess] Will assess ${sectionChecks.length} section(s)`);

    // 4. Fetch all screenshots for ALL checks in this element group
    const checkIds = sectionChecks.map(c => c.id);
    console.log(`[Assess] Fetching screenshots for ${checkIds.length} checks`);

    const { data: screenshotData, error: screenshotsError } = await supabase
      .from('screenshots')
      .select(
        `
        screenshot_url,
        caption,
        screenshot_check_assignments!inner(check_id)
      `
      )
      .in('screenshot_check_assignments.check_id', checkIds)
      .order('created_at', { ascending: true });

    const screenshots = screenshotData?.map((s: any) => ({
      screenshot_url: s.screenshot_url,
      caption: s.caption,
    }));

    if (screenshotsError) {
      return NextResponse.json({ error: 'Failed to fetch screenshots' }, { status: 500 });
    }

    console.log(`[Assess] Found ${screenshots?.length || 0} screenshots`);

    const screenshotUrls = await Promise.all(
      (screenshots || []).map(async s => await getPresignedUrl(s.screenshot_url))
    );

    // 5. Mark all checks as processing immediately
    await supabase.from('checks').update({ status: 'processing' }).in('id', checkIds);

    // 6. Prepare job metadata
    const batchGroupId = crypto.randomUUID();
    const totalBatches = sectionChecks.length;
    const { provider, modelName } = getModelConfig(aiProvider);

    console.log(`[Assess] Creating element-group meta-job for ${totalBatches} sections:`, {
      batchGroupId,
      totalBatches,
      isElementGrouped,
      elementLabel: check.instance_label,
    });

    // 7. Create a single META-job that will be expanded by queue processor
    const metaJobId = crypto.randomUUID();
    await kv.hset(`job:${metaJobId}`, {
      id: metaJobId,
      type: 'element_group_assessment',
      payload: JSON.stringify({
        checkIds: sectionChecks.map(c => c.id),
        batchGroupId,
        totalBatches,
        screenshotUrls,
        screenshots,
        buildingContext,
        customPrompt,
        extraContext,
        provider,
        modelName,
        assessmentId: check.assessment_id,
        elementGroupId: check.element_group_id,
        instanceLabel: check.instance_label,
      }),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
    });
    await kv.lpush('queue:analysis', metaJobId);

    console.log(`[Assess] Queued meta-job ${metaJobId} for ${totalBatches} sections`);

    // 8. Return response IMMEDIATELY
    const responsePayload = {
      success: true,
      batchGroupId,
      totalBatches,
      message: `Assessment queued. Processing ${totalBatches} section(s) in background.`,
    };
    console.log(`[Assess] Returning response:`, responsePayload);

    return NextResponse.json(responsePayload);
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

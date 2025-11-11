import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { kv } from '@/lib/kv';
import { checkDoorCompliance } from '@/lib/compliance/doors/rules';
import { isCaliforniaProject, splitDoorChecks } from '@/lib/compliance/doors/sections';

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
    // 1. Fetch check from DB with project and element instance info
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select(
        `
        *, 
        assessments(
          project_id, 
          projects(
            extracted_variables, 
            code_assembly_id, 
            selected_code_ids
          )
        ),
        element_instances(
          id,
          parameters,
          element_groups(slug, name)
        )
      `
      )
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
    const selectedCodeIds = project?.selected_code_ids || [];

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

    // 4. Check if this is a California door with parameters - use hybrid approach
    const elementInstance = Array.isArray(check.element_instances)
      ? check.element_instances[0]
      : check.element_instances;
    const elementGroupSlug = (elementInstance?.element_groups as any)?.slug;
    const instanceParameters = elementInstance?.parameters;

    const isCaliforniaDoor =
      elementGroupSlug === 'doors' && isCaliforniaProject(selectedCodeIds) && instanceParameters;

    let ruleBasedSections: any[] = [];
    let aiBasedSections: any[] = sectionChecks;

    if (isCaliforniaDoor) {
      console.log(`[Assess] 🚪 California door detected - using hybrid compliance checking`);

      const { ruleBasedChecks, aiBasedChecks } = splitDoorChecks(sectionChecks);
      ruleBasedSections = ruleBasedChecks;
      aiBasedSections = aiBasedChecks;

      console.log(
        `[Assess] Split: ${ruleBasedSections.length} rule-based, ${aiBasedSections.length} AI-based`
      );

      // 5. Process rule-based sections immediately
      if (ruleBasedSections.length > 0) {
        try {
          const violations = checkDoorCompliance(instanceParameters);

          console.log(`[Assess] Rule engine found ${violations.length} violations`);

          // Update each rule-based check with compliance status
          for (const ruleCheck of ruleBasedSections) {
            // Find violations for this specific section
            const sectionViolations = violations.filter(v =>
              ruleCheck.code_section_number.startsWith(v.code_section.replace(/_.*$/, ''))
            );

            const status = sectionViolations.length > 0 ? 'non_compliant' : 'compliant';
            const note =
              sectionViolations.length > 0
                ? sectionViolations.map(v => `${v.description} (${v.severity})`).join('\n')
                : 'All rule-based requirements satisfied';

            await supabase
              .from('checks')
              .update({
                manual_status: status,
                manual_status_note: note,
                manual_status_at: new Date().toISOString(),
                manual_status_by: 'rules_engine',
                status: 'completed',
              })
              .eq('id', ruleCheck.id);

            console.log(`[Assess] ✅ Rule-checked: ${ruleCheck.code_section_number} = ${status}`);
          }
        } catch (error) {
          console.error('[Assess] Rule engine error:', error);
          // Fall back to AI for these sections if rules fail
          aiBasedSections = sectionChecks;
        }
      }
    }

    // 6. If no AI sections to process, return early
    if (aiBasedSections.length === 0) {
      console.log('[Assess] All sections processed by rules engine');
      return NextResponse.json({
        success: true,
        message: 'All sections processed by rule-based compliance checking',
        sections_processed: ruleBasedSections.length,
        rule_based: true,
      });
    }

    // 7. Fetch all screenshots for AI-based checks only
    const checkIds = aiBasedSections.map(c => c.id);
    console.log(`[Assess] Fetching screenshots for ${checkIds.length} AI-based checks`);

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

    // 8. Mark AI-based checks as processing
    await supabase.from('checks').update({ status: 'processing' }).in('id', checkIds);

    // 9. Prepare job metadata for AI processing
    const batchGroupId = crypto.randomUUID();
    const totalBatches = aiBasedSections.length;
    const { provider, modelName } = getModelConfig(aiProvider);

    console.log(`[Assess] Creating element-group meta-job for ${totalBatches} AI sections:`, {
      batchGroupId,
      totalBatches,
      isElementGrouped,
      elementLabel: check.instance_label,
      ruleProcessed: ruleBasedSections.length,
    });

    // 10. Create a single META-job that will be expanded by queue processor
    const metaJobId = crypto.randomUUID();
    await kv.hset(`job:${metaJobId}`, {
      id: metaJobId,
      type: 'element_group_assessment',
      payload: JSON.stringify({
        checkIds: aiBasedSections.map(c => c.id),
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

    console.log(`[Assess] Queued meta-job ${metaJobId} for ${totalBatches} AI sections`);

    // 11. Return response IMMEDIATELY
    const responsePayload = {
      success: true,
      batchGroupId,
      totalBatches,
      message: `Assessment queued. Processing ${totalBatches} section(s) via AI${ruleBasedSections.length > 0 ? `, ${ruleBasedSections.length} via rules` : ''}.`,
      rule_based_sections: ruleBasedSections.length,
      ai_based_sections: aiBasedSections.length,
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

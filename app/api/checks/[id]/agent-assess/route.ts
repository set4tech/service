import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const RAILWAY_AGENT_URL =
  process.env.RAILWAY_AGENT_URL || 'https://agent-production.up.railway.app';

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  console.log(`[AgentAssess] POST received for check ${checkId}`);

  try {
    // 1. Fetch check with section data and assessment/project info
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select(
        `
        *,
        sections!checks_section_id_fkey(id, key, number, title, text, tables),
        assessments(
          id,
          project_id,
          projects(extracted_variables, pdf_url)
        )
      `
      )
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      console.error('[AgentAssess] Check not found:', checkError);
      return Response.json({ error: 'Check not found' }, { status: 404 });
    }

    const assessment = check.assessments as any;
    const section = check.sections as any;

    console.log(`[AgentAssess] Check loaded:`, {
      checkId,
      sectionNumber: section?.number,
      sectionTitle: section?.title,
      assessmentId: assessment?.id,
    });

    // 2. Get screenshots for this check
    const { data: screenshots } = await supabase
      .from('screenshot_check_assignments')
      .select('screenshots(screenshot_url)')
      .eq('check_id', checkId);

    const screenshotUrls = await Promise.all(
      (screenshots || [])
        .filter((s: any) => s.screenshots?.screenshot_url)
        .map(async (s: any) => await getPresignedUrl(s.screenshots.screenshot_url))
    );

    console.log(`[AgentAssess] Found ${screenshotUrls.length} screenshots`);

    // 3. Get next run number for this check
    const { data: latestRun } = await supabase
      .from('agent_analysis_runs')
      .select('run_number')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRunNumber = (latestRun?.run_number || 0) + 1;

    // 4. Create pending agent_analysis_runs record
    const { data: run, error: runError } = await supabase
      .from('agent_analysis_runs')
      .insert({
        check_id: checkId,
        run_number: nextRunNumber,
        status: 'running',
        ai_model: 'claude-sonnet-4-20250514',
        ai_provider: 'anthropic',
      })
      .select()
      .single();

    if (runError) {
      console.error('[AgentAssess] Failed to create run record:', runError);
      return Response.json({ error: 'Failed to create run record' }, { status: 500 });
    }

    console.log(`[AgentAssess] Created agent run ${run.id}, run_number=${nextRunNumber}`);

    // 5. Build request payload for Railway agent
    const payload = {
      check_id: checkId,
      agent_run_id: run.id,
      assessment_id: assessment.id,
      code_section: {
        number: section?.number || check.code_section_number,
        title: section?.title || check.code_section_title,
        text: section?.text,
        tables: section?.tables,
      },
      building_context: assessment?.projects?.extracted_variables || {},
      screenshots: screenshotUrls,
    };

    console.log(`[AgentAssess] Sending request to Railway agent:`, {
      url: `${RAILWAY_AGENT_URL}/assess-check`,
      codeSection: payload.code_section.number,
      screenshotCount: screenshotUrls.length,
    });

    // 6. Forward to Railway agent and stream response
    const response = await fetch(`${RAILWAY_AGENT_URL}/assess-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      console.error('[AgentAssess] Railway agent request failed:', response.status, errorText);

      // Mark run as failed
      await supabase
        .from('agent_analysis_runs')
        .update({
          status: 'failed',
          error: `Railway agent error: ${response.status} - ${errorText}`,
        })
        .eq('id', run.id);

      return Response.json({ error: `Agent request failed: ${response.status}` }, { status: 500 });
    }

    // 7. Transform and forward SSE stream
    const startTime = Date.now();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        let finalResult: any = null;
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            buffer += text;

            // Forward raw SSE chunks to client
            controller.enqueue(new TextEncoder().encode(text));

            // Parse for done event to save result
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'done') {
                    finalResult = data.result;
                    console.log('[AgentAssess] Received final result:', {
                      status: finalResult?.compliance_status,
                      confidence: finalResult?.confidence,
                      iterationCount: finalResult?.iteration_count,
                    });
                  } else if (data.type === 'error') {
                    console.error('[AgentAssess] Agent error:', data.message);
                    finalResult = { error: data.message };
                  }
                } catch {
                  // Ignore parse errors for non-JSON lines
                }
              }
            }
          }
        } catch (err) {
          console.error('[AgentAssess] Stream error:', err);
        }

        // 8. Save final result to database
        const executionTimeMs = Date.now() - startTime;

        if (finalResult && !finalResult.error) {
          await supabase
            .from('agent_analysis_runs')
            .update({
              status: 'completed',
              compliance_status: finalResult.compliance_status,
              confidence: finalResult.confidence,
              ai_reasoning: finalResult.ai_reasoning,
              violations: finalResult.violations,
              recommendations: finalResult.recommendations,
              compliant_aspects: finalResult.compliant_aspects,
              additional_evidence_needed: finalResult.additional_evidence_needed,
              reasoning_trace: finalResult.reasoning_trace,
              tools_used: finalResult.tools_used,
              iteration_count: finalResult.iteration_count,
              raw_ai_response: finalResult.raw_response,
              execution_time_ms: executionTimeMs,
              completed_at: new Date().toISOString(),
            })
            .eq('id', run.id);

          console.log(`[AgentAssess] Saved completed run ${run.id} in ${executionTimeMs}ms`);
        } else {
          await supabase
            .from('agent_analysis_runs')
            .update({
              status: 'failed',
              error: finalResult?.error || 'No result received from agent',
              execution_time_ms: executionTimeMs,
            })
            .eq('id', run.id);

          console.log(`[AgentAssess] Marked run ${run.id} as failed`);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[AgentAssess] Unexpected error:', error);
    return Response.json({ error: error?.message || 'Agent assessment failed' }, { status: 500 });
  }
}

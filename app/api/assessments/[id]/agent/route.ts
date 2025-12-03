import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const RAILWAY_AGENT_URL = process.env.RAILWAY_AGENT_URL || 'http://localhost:8000';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const supabase = supabaseAdmin();

  console.warn('[POST /api/assessments/[id]/agent] Starting agent for assessment:', assessmentId);

  try {
    // 1. Verify assessment exists and get PDF URL from project
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, project_id, projects(pdf_url)')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      console.error('[agent] Assessment not found:', assessmentError);
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projects = assessment.projects as any;
    const pdfUrl = projects?.pdf_url as string | null;
    if (!pdfUrl) {
      console.error('[agent] Project has no PDF');
      return NextResponse.json({ error: 'Project has no PDF uploaded' }, { status: 400 });
    }

    // Extract S3 key from PDF URL (e.g., "drawings/project-id/file.pdf")
    const pdfS3Key = pdfUrl.includes('/') ? pdfUrl.split('.com/').pop() || pdfUrl : pdfUrl;
    console.warn('[agent] PDF S3 key:', pdfS3Key);

    // 2. Check if there's already a running agent
    const { data: existingRun } = await supabase
      .from('agent_runs')
      .select('id, status')
      .eq('assessment_id', assessmentId)
      .in('status', ['pending', 'running'])
      .single();

    if (existingRun) {
      console.warn('[agent] Agent already running:', existingRun.id);
      return NextResponse.json(
        { error: 'An agent is already running for this assessment', existingRunId: existingRun.id },
        { status: 409 }
      );
    }

    // 3. Create agent_run record
    const { data: agentRun, error: createError } = await supabase
      .from('agent_runs')
      .insert({
        assessment_id: assessmentId,
        status: 'pending',
        progress: { message: 'Queued...' },
      })
      .select()
      .single();

    if (createError || !agentRun) {
      console.error('[agent] Failed to create agent_run:', createError);
      return NextResponse.json({ error: 'Failed to create agent run' }, { status: 500 });
    }

    console.warn('[agent] Created agent_run:', agentRun.id);

    // 4. Trigger Railway service in background (don't await - return immediately)
    // This prevents the API from being slow due to Railway cold starts
    const triggerRailway = async () => {
      try {
        console.warn('[agent] Triggering Railway service...');
        const railwayResponse = await fetch(`${RAILWAY_AGENT_URL}/preprocess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessment_id: assessmentId,
            agent_run_id: agentRun.id,
            pdf_s3_key: pdfS3Key,
          }),
        });

        if (!railwayResponse.ok) {
          const errorText = await railwayResponse.text();
          console.error('[agent] Railway service error:', errorText);

          // Mark as failed
          await supabase
            .from('agent_runs')
            .update({ status: 'failed', error: `Railway service error: ${errorText}` })
            .eq('id', agentRun.id);
          return;
        }

        const railwayData = await railwayResponse.json();
        console.warn('[agent] Railway response:', railwayData);
      } catch (railwayError) {
        console.error('[agent] Failed to call Railway service:', railwayError);

        // Mark as failed
        await supabase
          .from('agent_runs')
          .update({
            status: 'failed',
            error: `Could not reach agent service: ${railwayError instanceof Error ? railwayError.message : 'Unknown error'}`,
          })
          .eq('id', agentRun.id);
      }
    };

    // Fire and forget - don't await
    triggerRailway();

    // Return immediately with the agent run info
    return NextResponse.json({
      message: 'Agent started',
      agentRun: {
        id: agentRun.id,
        status: agentRun.status,
        progress: agentRun.progress,
      },
    });
  } catch (error) {
    console.error('[agent] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

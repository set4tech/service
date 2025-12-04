import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const RAILWAY_AGENT_URL = process.env.RAILWAY_AGENT_URL;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const supabase = supabaseAdmin();

  console.log(`[filter-checks] Starting filtering for assessment ${assessmentId}`);

  if (!RAILWAY_AGENT_URL) {
    console.error('[filter-checks] RAILWAY_AGENT_URL env var not set');
    return NextResponse.json({ error: 'RAILWAY_AGENT_URL not configured' }, { status: 500 });
  }

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const reset = body.reset === true;

    // Verify assessment exists
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, filtering_status')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if already in progress
    if (assessment.filtering_status === 'in_progress') {
      return NextResponse.json({ error: 'Filtering already in progress' }, { status: 400 });
    }

    // Call the Python agent service to run filtering in background
    console.log(`[filter-checks] Calling agent service at ${RAILWAY_AGENT_URL}/filter`);

    const agentResponse = await fetch(`${RAILWAY_AGENT_URL}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessment_id: assessmentId,
        reset,
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error(`[filter-checks] Agent service error: ${errorText}`);
      return NextResponse.json(
        { error: `Agent service error: ${errorText}` },
        { status: agentResponse.status }
      );
    }

    const agentResult = await agentResponse.json();
    console.log(`[filter-checks] Agent service response:`, agentResult);

    return NextResponse.json({
      status: 'started',
      message: 'Filtering started in background',
    });
  } catch (error) {
    console.error('[filter-checks] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start filtering',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

const RAILWAY_AGENT_URL = process.env.RAILWAY_AGENT_URL || 'http://localhost:8000';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;

  console.warn('[POST /api/assessments/[id]/chat] Chat request for assessment:', assessmentId);

  try {
    const body = await request.json();
    const { message, conversation_id } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Forward to Railway chat endpoint
    console.warn('[chat] Forwarding to Railway service...');
    const railwayResponse = await fetch(`${RAILWAY_AGENT_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessment_id: assessmentId,
        message,
        conversation_id,
      }),
    });

    if (!railwayResponse.ok) {
      const errorText = await railwayResponse.text();
      console.error('[chat] Railway error:', errorText);
      return NextResponse.json(
        { error: `Agent service error: ${errorText}` },
        { status: railwayResponse.status }
      );
    }

    // Stream the SSE response through to the client
    if (!railwayResponse.body) {
      return NextResponse.json({ error: 'No response body from agent' }, { status: 500 });
    }

    // Return streaming response
    return new Response(railwayResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[chat] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

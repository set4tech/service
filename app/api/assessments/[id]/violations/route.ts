import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/assessments/[id]/violations
 *
 * Fetches fresh violations data for an assessment using the same RPC
 * that's called on initial page load.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const supabase = supabaseAdmin();

    // Call the same RPC that's used on initial page load
    const { data: rpcViolations, error } = await supabase.rpc('get_assessment_report', {
      assessment_uuid: assessmentId,
    });

    if (error) {
      console.error('[violations] RPC error:', error);
      return NextResponse.json({ error: 'Failed to fetch violations' }, { status: 500 });
    }

    return NextResponse.json({
      violations: rpcViolations || [],
      count: rpcViolations?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[violations] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

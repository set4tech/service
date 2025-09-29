import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assessmentId = searchParams.get('assessmentId');

  try {
    const supabase = supabaseAdmin();

    if (assessmentId) {
      // Check for specific assessment
      const { data: checks, error } = await supabase
        .from('check_summary')
        .select('*')
        .eq('assessment_id', assessmentId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        assessment_id: assessmentId,
        checks_found: checks?.length || 0,
        checks: checks?.slice(0, 5) || [],
      });
    }

    // Get overall stats
    const { data: allChecks, error: allError } = await supabase
      .from('check_summary')
      .select('assessment_id')
      .limit(10);

    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }

    // Count by assessment
    const assessmentCounts =
      allChecks?.reduce((acc: Record<string, number>, check) => {
        acc[check.assessment_id] = (acc[check.assessment_id] || 0) + 1;
        return acc;
      }, {}) || {};

    return NextResponse.json({
      total_checks: allChecks?.length || 0,
      assessments_with_checks: Object.keys(assessmentCounts).length,
      sample_assessments: assessmentCounts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Database connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    // Call the RPC function to get all checks with calculation tables
    const { data, error } = await supabase.rpc('get_assessment_calculation_tables', {
      assessment_uuid: id,
    });

    if (error) {
      console.error('[GET /api/assessments/[id]/calculation-tables] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch calculation tables', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tables: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('[GET /api/assessments/[id]/calculation-tables] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

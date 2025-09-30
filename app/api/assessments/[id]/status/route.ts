import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  try {
    // Get assessment status
    const { data: assessment, error } = await supabase
      .from('assessments')
      .select('seeding_status, sections_processed, sections_total')
      .eq('id', id)
      .single();

    if (error || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Get current check count
    const { count: checkCount } = await supabase
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', id);

    return NextResponse.json({
      seeding_status: assessment.seeding_status,
      sections_processed: assessment.sections_processed || 0,
      sections_total: assessment.sections_total || 0,
      check_count: checkCount || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch assessment status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

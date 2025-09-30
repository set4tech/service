import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: checkId } = await params;
    const supabase = supabaseAdmin();

    const { data: runs, error } = await supabase
      .from('analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false });

    if (error) {
      console.error('Error fetching analysis runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (error) {
    console.error('Failed to fetch analysis runs:', error);
    return NextResponse.json({ error: 'Failed to fetch analysis runs' }, { status: 500 });
  }
}

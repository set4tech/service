import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('latest_analysis_runs')
    .select('*')
    .eq('check_id', checkId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ latest: data });
}

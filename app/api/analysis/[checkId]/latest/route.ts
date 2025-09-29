import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: Request, { params }: { params: { checkId: string } }) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('latest_analysis_runs').select('*').eq('check_id', params.checkId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ latest: data });
}
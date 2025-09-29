import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: Request, { params }: { params: { checkId: string } }) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('analysis_runs').select('*').eq('check_id', params.checkId).order('run_number', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data });
}
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const assessmentId = new URL(req.url).searchParams.get('assessment_id');
  const supabase = supabaseAdmin();
  const query = supabase.from('check_summary').select('*');
  const { data, error } = assessmentId ? await query.eq('assessment_id', assessmentId) : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checks: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('checks').insert(body).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ check: data });
}
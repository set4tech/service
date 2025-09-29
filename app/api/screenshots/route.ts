import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const supabase = supabaseAdmin();
  const query = supabase.from('screenshots').select('*');
  const { data, error } = checkId ? await query.eq('check_id', checkId).order('created_at', { ascending: false }) : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ screenshots: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('screenshots').insert(body).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ screenshot: data });
}
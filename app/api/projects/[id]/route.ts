import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('projects').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ project: data });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('projects').update(body).eq('id', params.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ project: data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('projects').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
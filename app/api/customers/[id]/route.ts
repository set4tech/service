import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ customer: data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('customers')
    .update(body)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ customer: data });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  // Check if customer has any projects (FK constraint will fail anyway, but better error message)
  const { data: projects } = await supabase.from('projects').select('id').eq('customer_id', id);
  if (projects && projects.length > 0) {
    return NextResponse.json(
      { error: 'Cannot delete customer with existing projects. Delete projects first.' },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

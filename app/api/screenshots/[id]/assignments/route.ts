import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from('screenshot_check_assignments')
    .select('check_id, is_original, assigned_at')
    .eq('screenshot_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { newName, newLocation } = await req.json();
  const supabase = supabaseAdmin();

  const { data: original, error: e1 } = await supabase.from('checks').select('*').eq('id', params.id).single();
  if (e1 || !original) return NextResponse.json({ error: e1?.message || 'Not found' }, { status: 404 });

  const clone = {
    assessment_id: original.assessment_id,
    code_section_key: original.code_section_key,
    code_section_number: original.code_section_number,
    code_section_title: original.code_section_title,
    check_name: newName,
    check_location: newLocation,
    parent_check_id: original.id,
    prompt_template_id: original.prompt_template_id,
    status: 'pending'
  };

  const { data, error } = await supabase.from('checks').insert(clone).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ check: data });
}
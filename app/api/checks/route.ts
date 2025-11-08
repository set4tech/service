import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const assessmentId = searchParams.get('assessment_id');
  const elementGroupId = searchParams.get('element_group_id');
  const instanceLabel = searchParams.get('instance_label');

  const supabase = supabaseAdmin();

  // If querying by element_group_id + instance_label, return all sections for that instance
  if (assessmentId && elementGroupId && instanceLabel) {
    const { data: checksData, error } = await supabase
      .from('checks')
      .select('*, sections!checks_section_id_fkey(key)')
      .eq('assessment_id', assessmentId)
      .eq('element_group_id', elementGroupId)
      .eq('instance_label', instanceLabel)
      .order('code_section_number')
      .limit(10000); // Override Supabase default limit

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(checksData || []);
  }

  // Otherwise use check_summary view
  const query = supabase.from('check_summary').select('*');
  const { data, error } = assessmentId
    ? await query.eq('assessment_id', assessmentId)
    : await query;
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

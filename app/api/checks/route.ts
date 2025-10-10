import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const assessmentId = searchParams.get('assessment_id');
  const elementGroupId = searchParams.get('element_group_id');
  const instanceLabel = searchParams.get('instance_label');
  const parentCheckId = searchParams.get('parent_check_id'); // Legacy support

  const supabase = supabaseAdmin();

  // If querying by element_group_id + instance_label, return all sections for that instance
  if (assessmentId && elementGroupId && instanceLabel) {
    const { data: checks, error } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('element_group_id', elementGroupId)
      .eq('instance_label', instanceLabel)
      .order('code_section_number');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(checks || []);
  }

  // Legacy: If querying by parent_check_id, use checks table directly
  if (parentCheckId) {
    const { data: checks, error } = await supabase
      .from('checks')
      .select('*, assessment_id')
      .eq('parent_check_id', parentCheckId)
      .order('code_section_number');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Filter out any sections that have been manually excluded from the assessment
    if (checks && checks.length > 0) {
      const assessmentId = checks[0].assessment_id;
      const { data: excludedSections } = await supabase
        .from('section_applicability_log')
        .select('section_key')
        .eq('assessment_id', assessmentId)
        .eq('decision_source', 'manual')
        .eq('decision', false);

      const excludedKeys = new Set(excludedSections?.map(s => s.section_key) || []);
      const filteredChecks = checks.filter(check => !excludedKeys.has(check.code_section_key));

      console.log(
        `Filtered ${checks.length - filteredChecks.length} excluded sections from child checks`
      );
      return NextResponse.json(filteredChecks);
    }

    return NextResponse.json(checks);
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

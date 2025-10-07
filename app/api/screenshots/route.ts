import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const assessmentId = new URL(req.url).searchParams.get('assessment_id');
  const supabase = supabaseAdmin();

  if (checkId) {
    // Fetch screenshots assigned to this check via junction table
    const { data, error } = await supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        )
      `
      )
      .eq('screenshot_check_assignments.check_id', checkId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flatten assignment metadata into screenshot objects
    const screenshots = (data || []).map((item: any) => ({
      ...item,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      screenshot_check_assignments: undefined, // Remove nested structure
    }));

    return NextResponse.json({ screenshots });
  } else if (assessmentId) {
    // Fetch all screenshots for an assessment via checks
    const { data, error } = await supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at,
          checks!inner(
            assessment_id,
            code_section_number,
            code_section_title
          )
        )
      `
      )
      .eq('screenshot_check_assignments.checks.assessment_id', assessmentId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flatten assignment metadata into screenshot objects
    const screenshots = (data || []).map((item: any) => ({
      ...item,
      check_id: item.screenshot_check_assignments?.[0]?.check_id,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      check_section_number: item.screenshot_check_assignments?.[0]?.checks?.code_section_number,
      check_section_title: item.screenshot_check_assignments?.[0]?.checks?.code_section_title,
      screenshot_check_assignments: undefined, // Remove nested structure
    }));

    return NextResponse.json({ screenshots });
  } else {
    // Fetch all screenshots
    const { data, error } = await supabase.from('screenshots').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ screenshots: data });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { check_id, ...screenshotData } = body; // Extract check_id

  const supabase = supabaseAdmin();

  // 1. Create screenshot without check_id
  const { data: screenshot, error: screenshotError } = await supabase
    .from('screenshots')
    .insert(screenshotData)
    .select('*')
    .single();

  if (screenshotError) {
    console.error('Error creating screenshot:', screenshotError);
    return NextResponse.json({ error: screenshotError.message }, { status: 400 });
  }

  // 2. Create assignment as original (if check_id provided)
  if (check_id) {
    const { error: assignmentError } = await supabase.from('screenshot_check_assignments').insert({
      screenshot_id: screenshot.id,
      check_id: check_id,
      is_original: true,
    });

    if (assignmentError) {
      console.error('Error creating assignment:', assignmentError);
      // Rollback screenshot if assignment fails
      await supabase.from('screenshots').delete().eq('id', screenshot.id);
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ screenshot });
}

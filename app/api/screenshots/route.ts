import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const assessmentId = new URL(req.url).searchParams.get('assessment_id');
  const screenshotType = new URL(req.url).searchParams.get('screenshot_type');
  const supabase = supabaseAdmin();

  if (checkId) {
    // Fetch screenshots assigned to this check via junction table
    let query = supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        ),
        element_groups(id, name, slug)
      `
      )
      .eq('screenshot_check_assignments.check_id', checkId);

    // Filter by screenshot_type if provided
    if (screenshotType && ['plan', 'elevation'].includes(screenshotType)) {
      query = query.eq('screenshot_type', screenshotType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flatten assignment metadata into screenshot objects
    const screenshots = (data || []).map((item: any) => ({
      ...item,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      screenshot_check_assignments: undefined, // Remove nested structure
    }));

    return NextResponse.json({ screenshots });
  } else if (assessmentId) {
    // Fetch assigned screenshots for an assessment via checks
    let assignedQuery = supabase
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
        ),
        element_groups(id, name, slug)
      `
      )
      .eq('screenshot_check_assignments.checks.assessment_id', assessmentId);

    // Filter by screenshot_type if provided
    if (screenshotType && ['plan', 'elevation'].includes(screenshotType)) {
      assignedQuery = assignedQuery.eq('screenshot_type', screenshotType);
    }

    const { data: assignedData, error: assignedError } = await assignedQuery.order('created_at', {
      ascending: false,
    });

    if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 500 });

    // Flatten assignment metadata into screenshot objects
    const assignedScreenshots = (assignedData || []).map((item: any) => ({
      ...item,
      check_id: item.screenshot_check_assignments?.[0]?.check_id,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      check_section_number: item.screenshot_check_assignments?.[0]?.checks?.code_section_number,
      check_section_title: item.screenshot_check_assignments?.[0]?.checks?.code_section_title,
      screenshot_check_assignments: undefined, // Remove nested structure
    }));

    // Fetch unassigned screenshots for this assessment (via screenshot_url pattern)
    const assignedIds = assignedScreenshots.map(s => s.id);

    // Fetch all screenshots for this assessment by URL pattern
    let allScreenshotsQuery = supabase
      .from('screenshots')
      .select('*')
      .like('screenshot_url', `%${assessmentId}%`);

    // Apply screenshot_type filter to unassigned screenshots as well
    if (screenshotType && ['plan', 'elevation'].includes(screenshotType)) {
      allScreenshotsQuery = allScreenshotsQuery.eq('screenshot_type', screenshotType);
    }

    const { data: allScreenshotsData, error: allScreenshotsError } =
      await allScreenshotsQuery.order('created_at', { ascending: false });

    if (allScreenshotsError)
      return NextResponse.json({ error: allScreenshotsError.message }, { status: 500 });

    // Filter out assigned screenshots in memory
    const unassignedData = (allScreenshotsData || []).filter(
      (screenshot: any) => !assignedIds.includes(screenshot.id)
    );

    // Mark unassigned screenshots
    const unassignedScreenshots = (unassignedData || []).map((item: any) => ({
      ...item,
      check_id: null,
      is_original: false,
      check_section_number: null,
      check_section_title: 'Unassigned',
    }));

    // Combine assigned and unassigned screenshots
    const screenshots = [...assignedScreenshots, ...unassignedScreenshots];

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

  // 3. Trigger background OCR extraction (non-blocking)
  // Only run if we have API keys configured
  if (process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY) {
    // Use the request host to construct the URL - works in all environments
    const host = req.headers.get('host');

    if (!host) {
      console.error('[screenshots] Missing host header, cannot trigger OCR extraction');
      return NextResponse.json({ screenshot });
    }
  }

  return NextResponse.json({ screenshot });
}

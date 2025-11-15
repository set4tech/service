import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const elementInstanceId = new URL(req.url).searchParams.get('element_instance_id');
  const assessmentId = new URL(req.url).searchParams.get('assessment_id');
  const screenshotType = new URL(req.url).searchParams.get('screenshot_type');
  const supabase = supabaseAdmin();

  if (elementInstanceId) {
    // Fetch screenshots assigned to this element instance
    let query = supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_element_instance_assignments!inner(
          element_instance_id,
          is_original,
          assigned_at
        ),
        element_groups(id, name, slug)
      `
      )
      .eq('screenshot_element_instance_assignments.element_instance_id', elementInstanceId);

    // Filter by screenshot_type if provided
    if (screenshotType && ['plan', 'elevation'].includes(screenshotType)) {
      query = query.eq('screenshot_type', screenshotType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flatten assignment metadata into screenshot objects
    const screenshots = (data || []).map((item: any) => ({
      ...item,
      is_original: item.screenshot_element_instance_assignments?.[0]?.is_original,
      screenshot_element_instance_assignments: undefined, // Remove nested structure
    }));

    return NextResponse.json({ screenshots });
  } else if (checkId) {
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
    try {
      console.log('[screenshots] Fetching screenshots for assessment:', assessmentId);

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

      if (assignedError) {
        console.error('[screenshots] Error fetching assigned screenshots for assessment:', {
          assessmentId,
          error: assignedError,
          message: assignedError.message,
          details: assignedError.details,
          hint: assignedError.hint,
          code: assignedError.code,
        });
        return NextResponse.json({ error: assignedError.message }, { status: 500 });
      }

      console.log('[screenshots] Found', assignedData?.length || 0, 'assigned screenshots');

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

      if (allScreenshotsError) {
        console.error('[screenshots] Error fetching all screenshots for assessment:', {
          assessmentId,
          error: allScreenshotsError,
          message: allScreenshotsError.message,
          details: allScreenshotsError.details,
          hint: allScreenshotsError.hint,
          code: allScreenshotsError.code,
        });
        return NextResponse.json({ error: allScreenshotsError.message }, { status: 500 });
      }

      console.log(
        '[screenshots] Found',
        allScreenshotsData?.length || 0,
        'total screenshots by URL pattern'
      );

      // Filter out assigned screenshots in memory
      const unassignedData = (allScreenshotsData || []).filter(
        (screenshot: any) => !assignedIds.includes(screenshot.id)
      );

      console.log('[screenshots] Found', unassignedData.length, 'unassigned screenshots');

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

      console.log('[screenshots] Returning', screenshots.length, 'total screenshots');
      return NextResponse.json({ screenshots });
    } catch (error) {
      console.error('[screenshots] Unexpected error in assessment screenshots endpoint:', {
        assessmentId,
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
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

  // 2. Create assignment (if check_id provided)
  // Use RPC function to assign to all checks in element instance
  if (check_id) {
    console.log('[screenshots] Assigning screenshot to check(s):', {
      screenshot_id: screenshot.id,
      check_id,
    });

    const { data: assignResult, error: assignmentError } = await supabase.rpc(
      'assign_screenshot_to_element_instances',
      {
        p_screenshot_id: screenshot.id,
        p_check_ids: [check_id],
      }
    );

    if (assignmentError) {
      console.error('[screenshots] Error creating assignment:', assignmentError);
      // Rollback screenshot if assignment fails
      await supabase.from('screenshots').delete().eq('id', screenshot.id);
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }

    console.log('[screenshots] ✅ Assigned to', assignResult?.assigned_count, 'checks');
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

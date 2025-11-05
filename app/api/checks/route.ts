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
    console.log('[checks] Fetching element instance checks:', {
      assessmentId,
      elementGroupId,
      instanceLabel,
    });

    const { data: checks, error } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('element_group_id', elementGroupId)
      .eq('instance_label', instanceLabel)
      .order('code_section_number')
      .limit(10000); // Override Supabase default limit

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch screenshots for these checks
    const checkIds = (checks || []).map(c => c.id);
    console.log('[checks] Fetching screenshots for', checkIds.length, 'checks');

    const { data: allScreenshots, error: screenshotsError } = await supabase
      .from('screenshot_check_assignments')
      .select(
        `
        check_id,
        is_original,
        screenshots (*)
      `
      )
      .in('check_id', checkIds)
      .order('screenshots(created_at)', { ascending: true });

    if (screenshotsError) {
      console.error('[checks] Error fetching screenshots:', screenshotsError);
    }

    // Create screenshots map
    const screenshotsMap = new Map<string, any[]>();
    (allScreenshots || []).forEach((assignment: any) => {
      if (!screenshotsMap.has(assignment.check_id)) {
        screenshotsMap.set(assignment.check_id, []);
      }
      if (assignment.screenshots) {
        screenshotsMap.get(assignment.check_id)!.push({
          ...assignment.screenshots,
          is_original: assignment.is_original,
        });
      }
    });

    console.log('[checks] Screenshots map:', {
      checksWithScreenshots: screenshotsMap.size,
      totalScreenshots: Array.from(screenshotsMap.values()).flat().length,
    });

    // Add screenshots to each check
    const checksWithScreenshots = (checks || []).map(check => ({
      ...check,
      screenshots: screenshotsMap.get(check.id) || [],
    }));

    return NextResponse.json(checksWithScreenshots);
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

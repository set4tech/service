import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instanceLabel, copyScreenshots = false } = await req.json();
  const supabase = supabaseAdmin();

  // Fetch the original check
  const { data: original, error: e1 } = await supabase
    .from('checks')
    .select('*')
    .eq('id', id)
    .single();
  if (e1 || !original)
    return NextResponse.json({ error: e1?.message || 'Not found' }, { status: 404 });

  // Determine the parent check ID
  const parentCheckId = original.parent_check_id || original.id;

  // Get the highest instance number for this parent
  const { data: siblings, error: siblingsError } = await supabase
    .from('checks')
    .select('instance_number')
    .or(`id.eq.${parentCheckId},parent_check_id.eq.${parentCheckId}`)
    .order('instance_number', { ascending: false })
    .limit(1);

  if (siblingsError) {
    console.error('Error fetching siblings:', siblingsError);
    return NextResponse.json({ error: 'Failed to determine instance number' }, { status: 500 });
  }

  const nextInstanceNumber =
    siblings && siblings.length > 0 && siblings[0].instance_number != null
      ? siblings[0].instance_number + 1
      : 2;

  // Create the new check instance
  const clone = {
    assessment_id: original.assessment_id,
    code_section_key: original.code_section_key,
    code_section_number: original.code_section_number,
    code_section_title: original.code_section_title,
    check_name: original.check_name,
    check_location: original.check_location,
    parent_check_id: parentCheckId,
    instance_number: nextInstanceNumber,
    instance_label: instanceLabel || `Instance ${nextInstanceNumber}`,
    prompt_template_id: original.prompt_template_id,
    status: 'pending',
  };

  const { data, error } = await supabase.from('checks').insert(clone).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Optionally copy screenshots
  if (copyScreenshots && data) {
    const { data: screenshots, error: screenshotsError } = await supabase
      .from('screenshots')
      .select('*')
      .eq('check_id', id);

    if (!screenshotsError && screenshots && screenshots.length > 0) {
      const newScreenshots = screenshots.map(screenshot => ({
        check_id: data.id,
        page_number: screenshot.page_number,
        crop_coordinates: screenshot.crop_coordinates,
        screenshot_url: screenshot.screenshot_url,
        thumbnail_url: screenshot.thumbnail_url,
        caption: screenshot.caption,
      }));

      await supabase.from('screenshots').insert(newScreenshots);
    }
  }

  return NextResponse.json({ check: data });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instanceLabel, copyScreenshots = false } = await req.json();
  const supabase = supabaseAdmin();

  // Fetch the original check with element group name
  const { data: original, error: e1 } = await supabase
    .from('checks')
    .select('*, element_groups(name)')
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
    // Copy element check fields if present
    check_type: original.check_type || 'section',
    element_group_id: original.element_group_id || null,
    element_sections: original.element_sections || null,
  };

  const { data, error } = await supabase
    .from('checks')
    .insert(clone)
    .select('*, element_groups(name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Flatten the element_groups join
  const flattenedData = data
    ? {
        ...data,
        element_group_name: (data as any).element_groups?.name || null,
      }
    : null;

  // If this is an element check, create child checks for each section
  if (flattenedData && flattenedData.check_type === 'element' && flattenedData.element_sections) {
    const sectionKeys = flattenedData.element_sections as string[];

    // Fetch section details
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('key, number, title')
      .in('key', sectionKeys);

    if (!sectionsError && sections) {
      const sectionChecks = sections.map(section => ({
        assessment_id: flattenedData.assessment_id,
        parent_check_id: flattenedData.id,
        check_type: 'section',
        check_name: `${flattenedData.instance_label} - ${section.title}`,
        code_section_key: section.key,
        code_section_number: section.number,
        code_section_title: section.title,
        element_group_id: flattenedData.element_group_id,
        instance_number: 0,
        instance_label: flattenedData.instance_label,
        status: 'pending',
      }));

      const { error: insertError } = await supabase.from('checks').insert(sectionChecks);

      if (insertError) {
        console.error('Error creating section checks:', insertError);
      }
    }
  }

  // Optionally copy screenshots (via assignments, not duplication)
  if (copyScreenshots && flattenedData) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('screenshot_check_assignments')
      .select('screenshot_id')
      .eq('check_id', id);

    if (!assignmentsError && assignments && assignments.length > 0) {
      const newAssignments = assignments.map(assignment => ({
        screenshot_id: assignment.screenshot_id,
        check_id: flattenedData.id,
        is_original: false, // NOT original, this is a reused screenshot
      }));

      const { error: insertError } = await supabase
        .from('screenshot_check_assignments')
        .insert(newAssignments);

      if (insertError) {
        console.error('Error creating screenshot assignments:', insertError);
      }
    }
  }

  return NextResponse.json({ check: flattenedData });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { instanceLabel, copyScreenshots = false } = await req.json();
  const supabase = supabaseAdmin();

  // Fetch the original check with element instance data
  const { data: original, error: e1 } = await supabase
    .from('checks')
    .select('*, element_instances(id, label, element_group_id, element_groups(name))')
    .eq('id', id)
    .single();
  if (e1 || !original)
    return NextResponse.json({ error: e1?.message || 'Not found' }, { status: 404 });

  // Determine if this is an element check (has element_instance_id)
  if (original.element_instance_id) {
    // Clone all sections for this element instance
    const { data: allSections, error: sectionsError } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', original.assessment_id)
      .eq('element_instance_id', original.element_instance_id);

    if (sectionsError || !allSections || allSections.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch element sections' }, { status: 500 });
    }

    // Get the element instance to find the element_group_id
    const originalElementInstance = original.element_instances as {
      element_group_id: string;
      label: string;
      element_groups?: { name: string };
    } | null;
    if (!originalElementInstance) {
      return NextResponse.json({ error: 'Element instance not found' }, { status: 404 });
    }

    const elementGroupId = originalElementInstance.element_group_id;

    // Create a new element_instance
    const { data: newInstance, error: instanceError } = await supabase
      .from('element_instances')
      .insert({
        assessment_id: original.assessment_id,
        element_group_id: elementGroupId,
        label: instanceLabel || null, // Trigger will auto-generate if null
      })
      .select('id, label')
      .single();

    if (instanceError) {
      if (instanceError.code === '23505') {
        return NextResponse.json(
          { error: 'An instance with that label already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: instanceError.message }, { status: 500 });
    }

    // Clone all section checks for this element instance
    const clonedSections = allSections.map(section => ({
      assessment_id: section.assessment_id,
      section_id: section.section_id,
      code_section_number: section.code_section_number,
      code_section_title: section.code_section_title?.replace(
        originalElementInstance.label,
        newInstance.label
      ),
      check_name: section.check_name?.replace(originalElementInstance.label, newInstance.label),
      check_location: section.check_location,
      element_instance_id: newInstance.id,
      prompt_template_id: section.prompt_template_id,
      status: 'pending',
      // Note: element_group_id and instance_label are deprecated, not setting them
    }));

    const { data: createdChecks, error: insertError } = await supabase
      .from('checks')
      .insert(clonedSections)
      .select('*, element_instances(id, label, element_group_id, element_groups(name))');

    if (insertError || !createdChecks || createdChecks.length === 0) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create checks' },
        { status: 500 }
      );
    }

    // Optionally copy screenshots - use element_instance assignment for element-based checks
    if (copyScreenshots) {
      // Get screenshots assigned to the original element instance
      const { data: instanceAssignments } = await supabase
        .from('screenshot_element_instance_assignments')
        .select('screenshot_id, is_original')
        .eq('element_instance_id', original.element_instance_id);

      if (instanceAssignments && instanceAssignments.length > 0) {
        // Assign to new element instance
        const newAssignments = instanceAssignments.map(a => ({
          screenshot_id: a.screenshot_id,
          element_instance_id: newInstance.id,
          is_original: false,
        }));
        await supabase.from('screenshot_element_instance_assignments').insert(newAssignments);
      }
    }

    // Return first check as representative
    const representativeCheck = createdChecks[0];

    return NextResponse.json({
      check: representativeCheck,
      instance_id: newInstance.id,
      instance_label: newInstance.label,
    });
  }

  // Standalone section check - convert to element check by creating element_instance
  // This allows multiple instances of the same section

  const sectionName = original.code_section_title || original.code_section_number || 'Check';
  const defaultLabel = instanceLabel || `${sectionName} - Instance 2`;

  // Create element_instance for this section check (with NULL element_group_id for ad-hoc instances)
  const { data: newInstance, error: instanceError } = await supabase
    .from('element_instances')
    .insert({
      assessment_id: original.assessment_id,
      element_group_id: null, // NULL for ad-hoc section instances
      label: defaultLabel,
    })
    .select('id, label')
    .single();

  if (instanceError) {
    if (instanceError.code === '23505') {
      return NextResponse.json(
        { error: 'An instance with that label already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: instanceError.message }, { status: 500 });
  }

  // Create the cloned check linked to the new element_instance
  // Setting element_instance_id makes this an "element check" which bypasses the section-based unique constraint
  const clone = {
    assessment_id: original.assessment_id,
    section_id: original.section_id,
    code_section_number: original.code_section_number,
    code_section_title: `${original.code_section_title} (${newInstance.label})`,
    check_name: `${original.check_name} - ${newInstance.label}`,
    check_location: original.check_location,
    element_instance_id: newInstance.id,
    prompt_template_id: original.prompt_template_id,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('checks')
    .insert(clone)
    .select('*, element_instances(id, label)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Optionally copy screenshots
  if (copyScreenshots && data) {
    const { data: assignments } = await supabase
      .from('screenshot_check_assignments')
      .select('screenshot_id')
      .eq('check_id', id);

    if (assignments && assignments.length > 0) {
      const newAssignments = assignments.map(assignment => ({
        screenshot_id: assignment.screenshot_id,
        element_instance_id: newInstance.id,
        is_original: false,
      }));
      await supabase.from('screenshot_element_instance_assignments').insert(newAssignments);
    }
  }

  return NextResponse.json({
    check: data,
    instance_id: newInstance.id,
    instance_label: newInstance.label,
  });
}

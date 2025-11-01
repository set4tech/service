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

  // Determine if this is an element check (has element_group_id and instance_label)
  if (original.element_group_id && original.instance_label) {
    // Clone all sections for this element instance
    const { data: allSections, error: sectionsError } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', original.assessment_id)
      .eq('element_group_id', original.element_group_id)
      .eq('instance_label', original.instance_label);

    if (sectionsError || !allSections || allSections.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch element sections' }, { status: 500 });
    }

    // Determine new instance label
    const elementGroupName = (original as any).element_groups?.name || 'Element';
    const { data: existingLabels } = await supabase
      .from('checks')
      .select('instance_label')
      .eq('assessment_id', original.assessment_id)
      .eq('element_group_id', original.element_group_id)
      .not('instance_label', 'is', null);

    const uniqueLabels = new Set((existingLabels || []).map((c: any) => c.instance_label));
    const nextNumber = uniqueLabels.size + 1;
    const newLabel = instanceLabel || `${elementGroupName} ${nextNumber}`;

    // Clone all section checks for this element instance
    const clonedSections = allSections.map(section => ({
      assessment_id: section.assessment_id,
      section_id: section.section_id,
      code_section_number: section.code_section_number,
      code_section_title: section.code_section_title,
      check_name: section.check_name?.replace(original.instance_label, newLabel),
      check_location: section.check_location,
      instance_label: newLabel,
      prompt_template_id: section.prompt_template_id,
      status: 'pending',
      element_group_id: section.element_group_id,
    }));

    const { data: createdChecks, error: insertError } = await supabase
      .from('checks')
      .insert(clonedSections)
      .select('*, element_groups(name)');

    if (insertError || !createdChecks || createdChecks.length === 0) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create checks' },
        { status: 500 }
      );
    }

    // Optionally copy screenshots to all cloned checks
    if (copyScreenshots) {
      for (const originalSection of allSections) {
        const { data: assignments } = await supabase
          .from('screenshot_check_assignments')
          .select('screenshot_id')
          .eq('check_id', originalSection.id);

        if (assignments && assignments.length > 0) {
          const matchingClone = createdChecks.find(
            c => c.code_section_number === originalSection.code_section_number
          );
          if (matchingClone) {
            const newAssignments = assignments.map(a => ({
              screenshot_id: a.screenshot_id,
              check_id: matchingClone.id,
              is_original: false,
            }));
            await supabase.from('screenshot_check_assignments').insert(newAssignments);
          }
        }
      }
    }

    // Return first check as representative
    // Note: element_groups.name is already included via JOIN in select()
    const representativeCheck = createdChecks[0];

    return NextResponse.json({ check: representativeCheck });
  }

  // Standalone section check - clone just this one
  const clone = {
    assessment_id: original.assessment_id,
    section_id: original.section_id,
    code_section_number: original.code_section_number,
    code_section_title: original.code_section_title,
    check_name: original.check_name,
    check_location: original.check_location,
    instance_label: instanceLabel || null,
    prompt_template_id: original.prompt_template_id,
    status: 'pending',
    element_group_id: null,
  };

  const { data, error } = await supabase
    .from('checks')
    .insert(clone)
    .select('*, element_groups(name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Note: element_groups.name is already included via JOIN in select()
  const flattenedData = data;

  // Optionally copy screenshots
  if (copyScreenshots && flattenedData) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('screenshot_check_assignments')
      .select('screenshot_id')
      .eq('check_id', id);

    if (!assignmentsError && assignments && assignments.length > 0) {
      const newAssignments = assignments.map(assignment => ({
        screenshot_id: assignment.screenshot_id,
        check_id: flattenedData.id,
        is_original: false,
      }));

      await supabase.from('screenshot_check_assignments').insert(newAssignments);
    }
  }

  return NextResponse.json({ check: flattenedData });
}

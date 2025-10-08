import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a new element check instance without requiring a template
 * POST /api/checks/create-element
 * Body: { assessmentId, elementGroupSlug, instanceLabel? }
 */
export async function POST(req: NextRequest) {
  const { assessmentId, elementGroupSlug, instanceLabel } = await req.json();

  if (!assessmentId || !elementGroupSlug) {
    return NextResponse.json(
      { error: 'assessmentId and elementGroupSlug are required' },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  // 1. Get element group info
  const { data: elementGroup, error: egError } = await supabase
    .from('element_groups')
    .select('id, name, slug')
    .eq('slug', elementGroupSlug)
    .single();

  if (egError || !elementGroup) {
    return NextResponse.json(
      { error: `Element group "${elementGroupSlug}" not found` },
      { status: 404 }
    );
  }

  // 2. Get section mappings for this element group
  const { data: mappings, error: mappingsError } = await supabase
    .from('element_group_section_mappings')
    .select('section_key')
    .eq('element_group_id', elementGroup.id);

  if (mappingsError) {
    return NextResponse.json(
      { error: `Failed to fetch section mappings: ${mappingsError.message}` },
      { status: 500 }
    );
  }

  const sectionKeys = (mappings || []).map(m => m.section_key);

  if (sectionKeys.length === 0) {
    return NextResponse.json(
      { error: `No section mappings found for element group "${elementGroupSlug}"` },
      { status: 400 }
    );
  }

  // 3. Get the next instance number (find max instance_number for this element group + assessment)
  const { data: existingChecks, error: existingError } = await supabase
    .from('checks')
    .select('instance_number')
    .eq('assessment_id', assessmentId)
    .eq('element_group_id', elementGroup.id)
    .eq('check_type', 'element')
    .order('instance_number', { ascending: false })
    .limit(1);

  if (existingError) {
    return NextResponse.json(
      { error: `Failed to determine instance number: ${existingError.message}` },
      { status: 500 }
    );
  }

  const nextInstanceNumber =
    existingChecks && existingChecks.length > 0 && existingChecks[0].instance_number != null
      ? existingChecks[0].instance_number + 1
      : 1;

  const label = instanceLabel || `${elementGroup.name} ${nextInstanceNumber}`;

  // 4. Pick a representative section for the main check (use first section key)
  // This is needed because checks table requires code_section_key
  const primarySectionKey = sectionKeys[0];

  // 5. Create the main element check
  const { data: newCheck, error: checkError } = await supabase
    .from('checks')
    .insert({
      assessment_id: assessmentId,
      check_type: 'element',
      element_group_id: elementGroup.id,
      instance_number: nextInstanceNumber,
      instance_label: label,
      code_section_key: primarySectionKey, // Required by schema
      code_section_title: `${elementGroup.name} ${nextInstanceNumber}`,
      element_sections: sectionKeys, // Keep for backward compatibility
      status: 'pending',
    })
    .select('*, element_groups(name)')
    .single();

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 400 });
  }

  // 6. Create child section checks for each mapped section
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('key, number, title')
    .in('key', sectionKeys);

  if (!sectionsError && sections) {
    const sectionChecks = sections.map(section => ({
      assessment_id: assessmentId,
      parent_check_id: newCheck.id,
      check_type: 'section',
      check_name: `${label} - ${section.title}`,
      code_section_key: section.key,
      code_section_number: section.number,
      code_section_title: section.title,
      element_group_id: elementGroup.id,
      instance_number: 0,
      instance_label: label,
      status: 'pending',
    }));

    const { error: insertError } = await supabase.from('checks').insert(sectionChecks);

    if (insertError) {
      console.error('Error creating section checks:', insertError);
      return NextResponse.json(
        { error: `Failed to create section checks: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  // 7. Flatten and return
  const flattenedCheck = {
    ...newCheck,
    element_group_name: (newCheck as any).element_groups?.name || null,
  };

  return NextResponse.json({ check: flattenedCheck });
}

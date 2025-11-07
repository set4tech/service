import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a new element check instance
 *
 * Flow:
 * 1. Creates a row in element_instances (label auto-generated if not provided)
 * 2. Fetches applicable sections for the element group
 * 3. Creates one check per section, all linked to the element instance
 *
 * POST /api/checks/create-element
 * Body: { assessmentId, elementGroupSlug, instanceLabel? }
 *
 * Returns: { element_instance_id, label, checks_created, check }
 */
export async function POST(req: NextRequest) {
  try {
    const { assessmentId, elementGroupSlug, instanceLabel } = await req.json();

    if (!assessmentId || !elementGroupSlug) {
      return NextResponse.json(
        { error: 'assessmentId and elementGroupSlug are required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1. Get element group
    const elementGroup = await getElementGroup(supabase, elementGroupSlug);
    if (!elementGroup) {
      return NextResponse.json(
        { error: `Element group "${elementGroupSlug}" not found` },
        { status: 404 }
      );
    }

    // 2. Create element instance (trigger auto-generates label if not provided)
    const instance = await createElementInstance(
      supabase,
      assessmentId,
      elementGroup.id,
      instanceLabel
    );

    // 3. Get sections for this element group
    const sections = await getElementSections(supabase, elementGroup.id, assessmentId);

    console.log('[create-element] Got sections:', {
      type: typeof sections,
      isArray: Array.isArray(sections),
      sections,
    });

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: 'No section mappings found for this element group' },
        { status: 400 }
      );
    }

    // 4. Create checks for each section
    const checks = await createSectionChecks(
      supabase,
      assessmentId,
      elementGroup.id,
      instance.id,
      instance.label,
      sections
    );

    console.log(
      `[create-element] Created instance "${instance.label}" with ${checks.length} checks`
    );

    return NextResponse.json({
      element_instance_id: instance.id,
      label: instance.label,
      checks_created: checks.length,
      check: checks[0], // For backwards compatibility
    });
  } catch (error: any) {
    console.error('[create-element] Error:', error);

    // Handle specific errors
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: 'An instance with that label already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

async function getElementGroup(supabase: any, slug: string) {
  const { data, error } = await supabase
    .from('element_groups')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (error) throw error;
  return data;
}

async function createElementInstance(
  supabase: any,
  assessmentId: string,
  elementGroupId: string,
  label?: string
) {
  const { data, error } = await supabase
    .from('element_instances')
    .insert({
      assessment_id: assessmentId,
      element_group_id: elementGroupId,
      label: label || null, // Trigger generates if null
    })
    .select('id, label')
    .single();

  if (error) {
    // Handle duplicate (race condition)
    if (error.code === '23505') {
      throw new Error('Instance with that label already exists');
    }
    throw error;
  }

  return data;
}

async function getElementSections(supabase: any, elementGroupId: string, assessmentId: string) {
  const { data, error } = await supabase.rpc('get_element_sections', {
    p_element_group_id: elementGroupId,
    p_assessment_id: assessmentId,
  });

  if (error) throw error;
  return data || [];
}

async function createSectionChecks(
  supabase: any,
  assessmentId: string,
  elementGroupId: string,
  elementInstanceId: string,
  instanceLabel: string,
  sections: Array<{
    section_id: string;
    section_key: string;
    section_number: string;
    section_title: string;
  }>
) {
  const checksToInsert = sections.map(section => ({
    assessment_id: assessmentId,
    element_instance_id: elementInstanceId,
    check_name: `${instanceLabel} - ${section.section_title}`,
    section_id: section.section_id,
    // Don't set code_section_key - it's deprecated and triggers old unique constraint
    code_section_number: section.section_number,
    code_section_title: section.section_title,
    status: 'pending',
  }));

  const { data } = await supabase.from('checks').insert(checksToInsert).select();

  return data;
}

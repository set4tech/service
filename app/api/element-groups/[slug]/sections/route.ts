import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = supabaseAdmin();

  // Get assessment_id from query params (optional, for assessment-specific mappings)
  const { searchParams } = new URL(req.url);
  const assessmentId = searchParams.get('assessment_id');

  // Get element group
  const { data: group, error: groupError } = await supabase
    .from('element_groups')
    .select('*')
    .eq('slug', slug)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: 'Element group not found' }, { status: 404 });
  }

  // Get sections using the new function that handles assessment-specific + global fallback
  if (assessmentId) {
    // Use the Postgres function to get assessment-specific or global mappings
    const { data: sectionKeys, error: sectionKeysError } = await supabase.rpc(
      'get_element_sections',
      {
        p_element_group_id: group.id,
        p_assessment_id: assessmentId,
      }
    );

    if (sectionKeysError) {
      return NextResponse.json({ error: sectionKeysError.message }, { status: 500 });
    }

    // Fetch full section details
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .in(
        'id',
        sectionKeys.map((sk: any) => sk.section_id)
      );

    if (sectionsError) {
      return NextResponse.json({ error: sectionsError.message }, { status: 500 });
    }

    return NextResponse.json({
      element_group: group,
      sections,
      section_keys: sections?.map((s: any) => s.key) || [],
      is_assessment_specific: sectionKeys.length > 0,
    });
  } else {
    // No assessment_id - return global mappings only
    const { data: mappings, error: mappingsError } = await supabase
      .from('element_section_mappings')
      .select(
        `
        section_id,
        sections (*)
      `
      )
      .eq('element_group_id', group.id)
      .is('assessment_id', null);

    if (mappingsError) {
      return NextResponse.json({ error: mappingsError.message }, { status: 500 });
    }

    const sections = (mappings || []).map((m: any) => m.sections);

    return NextResponse.json({
      element_group: group,
      sections,
      section_keys: sections.map((s: any) => s.key),
      is_assessment_specific: false,
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Get element-section mappings for an assessment
 * GET /api/assessments/[id]/element-mappings
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const supabase = supabaseAdmin();

  // Check if assessment has selected chapters
  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('selected_chapter_ids')
    .eq('id', assessmentId)
    .single();

  if (assessmentError || !assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  const hasSelectedChapters =
    assessment.selected_chapter_ids && assessment.selected_chapter_ids.length > 0;

  if (!hasSelectedChapters) {
    console.warn(
      `[element-mappings] Assessment ${assessmentId} has no selected chapters - element sections will be empty`
    );
  }

  // Get all element groups
  const { data: elementGroups, error: groupsError } = await supabase
    .from('element_groups')
    .select('id, name, slug')
    .order('sort_order');

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  // For each element group, get sections (assessment-specific or global)
  // Note: If assessment has no selected chapters, get_element_sections will return empty
  const mappings = await Promise.all(
    (elementGroups || []).map(async group => {
      const { data: sectionKeys, error: sectionsError } = await supabase.rpc(
        'get_element_sections',
        {
          p_element_group_id: group.id,
          p_assessment_id: assessmentId,
        }
      );

      if (sectionsError) {
        console.error(
          `[element-mappings] Error fetching sections for ${group.slug}:`,
          sectionsError
        );
      }

      // If no sections and no selected chapters, that's expected
      if ((!sectionKeys || sectionKeys.length === 0) && !hasSelectedChapters) {
        console.log(
          `[element-mappings] No sections for ${group.slug} (assessment has no selected chapters)`
        );
      }

      // Check if this is assessment-specific
      const { data: assessmentSpecific } = await supabase
        .from('element_section_mappings')
        .select('id')
        .eq('element_group_id', group.id)
        .eq('assessment_id', assessmentId)
        .limit(1);

      // Handle both old format (section_key) and new format (section_id)
      let keys: string[] = [];
      if (sectionKeys && sectionKeys.length > 0) {
        if (sectionKeys[0].section_key) {
          keys = sectionKeys.map((sk: any) => sk.section_key);
        } else if (sectionKeys[0].section_id) {
          // Convert section_id to section_key by looking up
          const { data: sections } = await supabase
            .from('sections')
            .select('key')
            .in(
              'id',
              sectionKeys.map((sk: any) => sk.section_id)
            );
          keys = (sections || []).map((s: any) => s.key);
        }
      }

      return {
        element_group: group,
        section_keys: keys,
        is_customized: (assessmentSpecific?.length || 0) > 0,
      };
    })
  );

  return NextResponse.json({ mappings });
}

/**
 * Copy global mappings to assessment for customization
 * POST /api/assessments/[id]/element-mappings/copy
 * Body: { elementGroupId?: string } - If omitted, copies all element groups
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { elementGroupId } = await req.json();
  const supabase = supabaseAdmin();

  const { error } = await supabase.rpc('copy_element_mappings_to_assessment', {
    p_assessment_id: assessmentId,
    p_element_group_id: elementGroupId || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * Reset assessment to global defaults
 * DELETE /api/assessments/[id]/element-mappings
 * Query param: elementGroupId (optional)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { searchParams } = new URL(req.url);
  const elementGroupId = searchParams.get('element_group_id');
  const supabase = supabaseAdmin();

  const { error } = await supabase.rpc('reset_element_mappings_to_global', {
    p_assessment_id: assessmentId,
    p_element_group_id: elementGroupId || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

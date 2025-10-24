import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Get element-section mappings for an assessment
 * GET /api/assessments/[id]/element-mappings
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const supabase = supabaseAdmin();

  // Get all element groups
  const { data: elementGroups, error: groupsError } = await supabase
    .from('element_groups')
    .select('id, name, slug')
    .order('sort_order');

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  // For each element group, get sections (assessment-specific or global)
  const mappings = await Promise.all(
    (elementGroups || []).map(async group => {
      const { data: sectionKeys } = await supabase.rpc('get_element_sections', {
        p_element_group_id: group.id,
        p_assessment_id: assessmentId,
      });

      // Check if this is assessment-specific
      const { data: assessmentSpecific } = await supabase
        .from('element_section_mappings')
        .select('id')
        .eq('element_group_id', group.id)
        .eq('assessment_id', assessmentId)
        .limit(1);

      return {
        element_group: group,
        section_keys: sectionKeys?.map((sk: any) => sk.section_key) || [],
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

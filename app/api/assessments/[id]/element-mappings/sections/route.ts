import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Add a section to an element group for this assessment
 * POST /api/assessments/[id]/element-mappings/sections
 * Body: { elementGroupId: string, sectionKey: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { elementGroupId, sectionKey } = await req.json();
  const supabase = supabaseAdmin();

  if (!elementGroupId || !sectionKey) {
    return NextResponse.json(
      { error: 'elementGroupId and sectionKey are required' },
      { status: 400 }
    );
  }

  // Get section ID from key
  const { data: sectionData } = await supabase
    .from('sections')
    .select('id')
    .eq('key', sectionKey)
    .single();

  if (!sectionData) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  // First, ensure this assessment has customized mappings (copy from global if not)
  const { data: existing } = await supabase
    .from('element_section_mappings')
    .select('id')
    .eq('element_group_id', elementGroupId)
    .eq('assessment_id', assessmentId)
    .limit(1);

  if (!existing || existing.length === 0) {
    // Copy global mappings first
    await supabase.rpc('copy_element_mappings_to_assessment', {
      p_assessment_id: assessmentId,
      p_element_group_id: elementGroupId,
    });
  }

  // Add the new section mapping
  const { data, error } = await supabase
    .from('element_section_mappings')
    .insert({
      element_group_id: elementGroupId,
      section_id: sectionData.id,
      assessment_id: assessmentId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Duplicate - already exists
      return NextResponse.json({ success: true, message: 'Mapping already exists' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mapping: data });
}

/**
 * Remove a section from an element group for this assessment
 * DELETE /api/assessments/[id]/element-mappings/sections
 * Query params: elementGroupId, sectionKey
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { searchParams } = new URL(req.url);
  const elementGroupId = searchParams.get('element_group_id');
  const sectionKey = searchParams.get('section_key');
  const supabase = supabaseAdmin();

  if (!elementGroupId || !sectionKey) {
    return NextResponse.json(
      { error: 'element_group_id and section_key query params are required' },
      { status: 400 }
    );
  }

  // Get section ID from key
  const { data: sectionData } = await supabase
    .from('sections')
    .select('id')
    .eq('key', sectionKey)
    .single();

  if (!sectionData) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  // First, ensure this assessment has customized mappings (copy from global if not)
  const { data: existing } = await supabase
    .from('element_section_mappings')
    .select('id')
    .eq('element_group_id', elementGroupId)
    .eq('assessment_id', assessmentId)
    .limit(1);

  if (!existing || existing.length === 0) {
    // Copy global mappings first so we can then remove this specific one
    await supabase.rpc('copy_element_mappings_to_assessment', {
      p_assessment_id: assessmentId,
      p_element_group_id: elementGroupId,
    });
  }

  // Remove the section mapping
  const { error } = await supabase
    .from('element_section_mappings')
    .delete()
    .eq('element_group_id', elementGroupId)
    .eq('section_id', sectionData.id)
    .eq('assessment_id', assessmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

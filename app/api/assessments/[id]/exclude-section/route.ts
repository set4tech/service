import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// POST - Exclude a section from this assessment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const { sectionKey, reason } = await req.json();

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Check if section exists
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('key, number, title')
      .eq('key', sectionKey)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Insert manual exclusion into section_applicability_log
    const { error: insertError } = await supabase.from('section_applicability_log').insert({
      assessment_id: assessmentId,
      section_key: sectionKey,
      decision: false, // false = excluded
      decision_source: 'manual',
      decision_confidence: null,
      reasons: reason ? [reason] : ['Manually excluded by user'],
      details: {},
      building_params_hash: '', // Not applicable for manual exclusions
      variables_snapshot: {},
    });

    if (insertError) {
      // Check if it's a duplicate (already excluded)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Section already excluded from this assessment' },
          { status: 409 }
        );
      }
      console.error('Error inserting manual exclusion:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Delete all checks for this section in this assessment
    // Need to delete in order to avoid foreign key constraint violations:
    // 1. First delete child checks (where parent_check_id references a check we're about to delete)
    // 2. Then delete parent checks

    // Find all checks that will be deleted (those with code_section_key = sectionKey)
    const { data: checksToDelete } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('code_section_key', sectionKey);

    if (checksToDelete && checksToDelete.length > 0) {
      const checkIdsToDelete = checksToDelete.map(c => c.id);

      // First, delete any child checks that reference these checks
      const { error: deleteChildrenError } = await supabase
        .from('checks')
        .delete()
        .in('parent_check_id', checkIdsToDelete);

      if (deleteChildrenError) {
        console.error('Error deleting child checks for excluded section:', deleteChildrenError);
      }

      // Now delete the parent checks
      const { error: deleteError } = await supabase
        .from('checks')
        .delete()
        .eq('assessment_id', assessmentId)
        .eq('code_section_key', sectionKey);

      if (deleteError) {
        console.error('Error deleting checks for excluded section:', deleteError);
        // Don't fail the request - the exclusion is logged, checks can be cleaned up later
      }
    }

    // Note: In flat section model, checks are deleted above if they match the excluded section
    // No need to update element_sections arrays (deprecated in new model)

    return NextResponse.json({
      success: true,
      section: {
        key: section.key,
        number: section.number,
        title: section.title,
      },
    });
  } catch (error: any) {
    console.error('Exclude section API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Un-exclude a section (allow it back in this assessment)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const { searchParams } = new URL(req.url);
    const sectionKey = searchParams.get('sectionKey');

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey parameter is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Remove manual exclusion from section_applicability_log
    const { error: deleteError } = await supabase
      .from('section_applicability_log')
      .delete()
      .eq('assessment_id', assessmentId)
      .eq('section_key', sectionKey)
      .eq('decision_source', 'manual');

    if (deleteError) {
      console.error('Error removing manual exclusion:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Re-create section check for this section
    const { data: section } = await supabase
      .from('sections')
      .select('key, number, title')
      .eq('key', sectionKey)
      .single();

    if (section) {
      // Check if this section is mapped to any element groups
      const { data: elementMappings } = await supabase
        .from('element_section_mappings')
        .select('element_group_id')
        .eq('section_key', sectionKey);

      const isElementMapped = elementMappings && elementMappings.length > 0;

      // Only create section-by-section check if not element-mapped
      if (!isElementMapped) {
        await supabase.from('checks').insert({
          assessment_id: assessmentId,
          code_section_key: section.key,
          code_section_number: section.number,
          code_section_title: section.title,
          check_name: `${section.number} - ${section.title}`,
          status: 'pending',
          instance_number: 1,
        });
      }

      // Note: In flat section model, section checks are created individually
      // No need to update element_sections arrays (deprecated in new model)
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Un-exclude section API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - List all excluded sections for this assessment
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const supabase = supabaseAdmin();

    // Get all manual exclusions with section details
    const { data, error } = await supabase
      .from('section_applicability_log')
      .select('section_key, reasons, created_at, sections(number, title)')
      .eq('assessment_id', assessmentId)
      .eq('decision_source', 'manual')
      .eq('decision', false);

    if (error) {
      console.error('Error fetching excluded sections:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const excludedSections = (data || []).map((item: any) => ({
      sectionKey: item.section_key,
      number: item.sections?.number,
      title: item.sections?.title,
      reasons: item.reasons,
      excludedAt: item.created_at,
    }));

    return NextResponse.json({ excludedSections });
  } catch (error: any) {
    console.error('Get excluded sections API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

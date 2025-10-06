import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Recursively find all descendant sections
async function findAllDescendants(supabase: any, parentKey: string): Promise<string[]> {
  const descendants: string[] = [];
  const queue: string[] = [parentKey];

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    descendants.push(currentKey);

    // Find direct children
    const { data: children } = await supabase
      .from('sections')
      .select('key')
      .eq('parent_key', currentKey);

    if (children && children.length > 0) {
      queue.push(...children.map((c: any) => c.key));
    }
  }

  return descendants;
}

// POST - Exclude a section group (parent + all descendants) from this assessment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const { sectionKeys, reason } = await req.json();

    if (!sectionKeys || !Array.isArray(sectionKeys)) {
      return NextResponse.json({ error: 'sectionKeys array is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Get section details for selected sections
    const { data: selectedSections } = await supabase
      .from('sections')
      .select('key, number, title')
      .in('key', sectionKeys);

    if (!selectedSections || selectedSections.length === 0) {
      return NextResponse.json({ error: 'No sections found to exclude' }, { status: 404 });
    }

    // Check which sections are already excluded
    const { data: alreadyExcluded } = await supabase
      .from('section_applicability_log')
      .select('section_key')
      .eq('assessment_id', assessmentId)
      .eq('decision_source', 'manual')
      .eq('decision', false)
      .in('section_key', sectionKeys);

    const alreadyExcludedKeys = new Set(
      (alreadyExcluded || []).map((item: any) => item.section_key)
    );

    // Filter out already excluded sections
    const sectionsToExclude = selectedSections.filter(s => !alreadyExcludedKeys.has(s.key));

    if (sectionsToExclude.length === 0) {
      return NextResponse.json({
        message: 'All selected sections are already excluded',
        skipped: selectedSections.length,
      });
    }

    console.log(
      `Excluding ${sectionsToExclude.length} sections, skipping ${alreadyExcludedKeys.size}...`
    );

    const excludedSections: any[] = [];
    const errors: any[] = [];

    // Exclude each section
    for (const section of sectionsToExclude) {
      try {
        // Insert manual exclusion
        const { error: insertError } = await supabase.from('section_applicability_log').insert({
          assessment_id: assessmentId,
          section_key: section.key,
          decision: false,
          decision_source: 'manual',
          decision_confidence: null,
          reasons: reason ? [reason] : ['Excluded as part of section group'],
          details: { excluded_with_group: true },
          building_params_hash: '',
          variables_snapshot: {},
        });

        if (insertError && insertError.code !== '23505') {
          // Log error but continue
          console.error(`Error excluding section ${section.key}:`, insertError);
          errors.push({ section: section.key, error: insertError.message });
          continue;
        }

        // Delete checks for this section (parent checks first, then children)
        const { data: checksToDelete } = await supabase
          .from('checks')
          .select('id')
          .eq('assessment_id', assessmentId)
          .eq('code_section_key', section.key);

        if (checksToDelete && checksToDelete.length > 0) {
          const checkIdsToDelete = checksToDelete.map(c => c.id);

          // Delete child checks first
          await supabase.from('checks').delete().in('parent_check_id', checkIdsToDelete);

          // Delete parent checks
          await supabase
            .from('checks')
            .delete()
            .eq('assessment_id', assessmentId)
            .eq('code_section_key', section.key);
        }

        // Update element checks to remove this section
        const { data: elementChecks } = await supabase
          .from('checks')
          .select('id, element_sections, code_section_key')
          .eq('assessment_id', assessmentId)
          .eq('check_type', 'element')
          .contains('element_sections', [section.key]);

        if (elementChecks) {
          for (const check of elementChecks) {
            const updatedSections = (check.element_sections || []).filter(
              (s: string) => s !== section.key
            );

            const updates: any = { element_sections: updatedSections };
            if (check.code_section_key === section.key && updatedSections.length > 0) {
              updates.code_section_key = updatedSections[0];
            }

            await supabase.from('checks').update(updates).eq('id', check.id);
          }
        }

        excludedSections.push({
          key: section.key,
          number: section.number,
          title: section.title,
        });
      } catch (err: any) {
        console.error(`Error processing section ${section.key}:`, err);
        errors.push({ section: section.key, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      excluded: excludedSections,
      skipped: alreadyExcludedKeys.size,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Exclude section group API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET - Preview which sections would be excluded in a group
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const { searchParams } = new URL(req.url);
    const sectionKey = searchParams.get('sectionKey');

    if (!sectionKey) {
      return NextResponse.json({ error: 'sectionKey parameter is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Find all descendants recursively
    const allSectionKeys = await findAllDescendants(supabase, sectionKey);

    // Get section details with text for preview
    const { data: allSections } = await supabase
      .from('sections')
      .select('key, number, title, text, paragraphs')
      .in('key', allSectionKeys)
      .order('number');

    // Check which are already excluded
    const { data: alreadyExcluded } = await supabase
      .from('section_applicability_log')
      .select('section_key')
      .eq('assessment_id', assessmentId)
      .eq('decision_source', 'manual')
      .eq('decision', false)
      .in('section_key', allSectionKeys);

    const alreadyExcludedKeys = new Set(
      (alreadyExcluded || []).map((item: any) => item.section_key)
    );

    const sections = (allSections || []).map((s: any) => ({
      key: s.key,
      number: s.number,
      title: s.title,
      text: s.text,
      paragraphs: s.paragraphs,
      alreadyExcluded: alreadyExcludedKeys.has(s.key),
    }));

    return NextResponse.json({ sections });
  } catch (error: any) {
    console.error('Preview section group API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

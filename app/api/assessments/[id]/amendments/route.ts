import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/assessments/[id]/amendments
 * Fetch jurisdiction-specific code amendments for this assessment
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log('[GET /api/assessments/:id/amendments] Assessment ID:', id);

    const supabase = supabaseAdmin();

    // Get the assessment's jurisdiction
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('jurisdiction')
      .eq('id', id)
      .single();

    if (assessmentError) {
      console.error('[Amendments API] Error fetching assessment:', assessmentError);
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    console.log('[Amendments API] Assessment jurisdiction:', assessment.jurisdiction);

    // If no jurisdiction set, return empty array
    if (!assessment.jurisdiction) {
      console.log('[Amendments API] No jurisdiction set for assessment');
      return NextResponse.json({ amendments: [] });
    }

    // Find all codes for this jurisdiction (e.g., Sacramento amendments)
    const { data: codes, error: codesError } = await supabase
      .from('codes')
      .select('id, title, year, source_url')
      .ilike('id', `${assessment.jurisdiction}+%`);

    if (codesError) {
      console.error('[Amendments API] Error fetching codes:', codesError);
      return NextResponse.json({ error: 'Failed to fetch codes' }, { status: 500 });
    }

    console.log('[Amendments API] Found codes:', codes?.length || 0);

    if (!codes || codes.length === 0) {
      return NextResponse.json({ amendments: [] });
    }

    // Get all chapters for these codes
    const codeIds = codes.map(c => c.id);
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapters')
      .select('id')
      .in('code_id', codeIds);

    if (chaptersError) {
      console.error('[Amendments API] Error fetching chapters:', chaptersError);
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ amendments: [] });
    }

    // Get all amendment sections from these chapters
    const chapterIds = chapters.map(ch => ch.id);
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select(
        `
        id,
        key,
        number,
        title,
        text,
        source_url,
        amends_section_id,
        chapters!inner(code_id, codes(title)),
        amended_section:amends_section_id (
          id,
          number,
          title,
          source_url
        )
      `
      )
      .in('chapter_id', chapterIds)
      .eq('item_type', 'section')
      .not('amends_section_id', 'is', null)
      .order('number');

    if (sectionsError) {
      console.error('[Amendments API] Error fetching sections:', sectionsError);
      return NextResponse.json({ error: 'Failed to fetch amendments' }, { status: 500 });
    }

    console.log('[Amendments API] Found amendment sections:', sections?.length || 0);

    // Fetch subsections for each amendment to get the detailed content
    const amendmentsWithContent = await Promise.all(
      sections.map(async section => {
        // Supabase returns foreign key relations as arrays even for single relations
        const amendedSection = Array.isArray(section.amended_section)
          ? section.amended_section[0]
          : section.amended_section;

        // Fetch subsections for this amendment
        const { data: subsections } = await supabase
          .from('sections')
          .select('number, title, paragraphs')
          .eq('parent_key', section.key)
          .eq('item_type', 'subsection')
          .order('number');

        // Extract code info from nested chapters relationship
        const chapterData = Array.isArray(section.chapters)
          ? section.chapters[0]
          : section.chapters;
        const codesData = chapterData?.codes;
        const codeData = Array.isArray(codesData) ? codesData[0] : codesData;

        return {
          id: section.id,
          key: section.key,
          number: section.number,
          title: section.title,
          text: section.text,
          sourceUrl: section.source_url,
          codeId: chapterData?.code_id || null, // Keep for backward compatibility
          codeTitle: codeData?.title || null,
          subsections: subsections || [],
          amendsSection: amendedSection
            ? {
                id: amendedSection.id,
                number: amendedSection.number,
                title: amendedSection.title,
                sourceUrl: amendedSection.source_url,
              }
            : null,
        };
      })
    );

    console.log('[Amendments API] Returning amendments:', amendmentsWithContent.length);
    return NextResponse.json({
      amendments: amendmentsWithContent,
      jurisdiction: assessment.jurisdiction,
    });
  } catch (error) {
    console.error('[Amendments API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

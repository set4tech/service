import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Cache for section data (in production, use Redis)
const sectionsCache = new Map<string, unknown>();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codeId = searchParams.get('codeId');
  const includeNonAssessable = searchParams.get('include_non_assessable') === 'true';
  const search = searchParams.get('search');

  if (!codeId) {
    return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
  }

  try {
    // Check cache first (cache key includes filter option and search query)
    const cacheKey = `${codeId}:${includeNonAssessable}:${search || ''}`;
    if (sectionsCache.has(cacheKey)) {
      return NextResponse.json(sectionsCache.get(cacheKey));
    }

    const supabase = supabaseAdmin();

    // Get code info
    const { data: code, error: codeError } = await supabase
      .from('codes')
      .select('id, title')
      .eq('id', codeId)
      .single();

    if (codeError || !code) {
      return NextResponse.json(
        {
          error: 'Code not found',
          details: `No code found for ID: ${codeId}`,
        },
        { status: 404 }
      );
    }

    // Determine the actual code_id to query and chapter prefix filter
    let queryCodeId = codeId;
    let chapterPrefix: string | null = null;

    // Handle virtual 11A and 11B codes by mapping to combined code and filtering
    if (codeId === 'ICC+CBC_Chapter11A+2025+CA') {
      queryCodeId = 'ICC+CBC_Chapter11A_11B+2025+CA';
      chapterPrefix = '11A-';
    } else if (codeId === 'ICC+CBC_Chapter11B+2025+CA') {
      queryCodeId = 'ICC+CBC_Chapter11A_11B+2025+CA';
      chapterPrefix = '11B-';
    }

    // Get all sections for this code (optionally filter by drawing_assessable)
    let query = supabase
      .from('sections')
      .select('key, number, title, text, item_type, paragraphs, source_url')
      .eq('code_id', queryCodeId);

    if (!includeNonAssessable) {
      query = query.eq('drawing_assessable', true);
    }

    // Add full-text search if search query provided
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      query = query.or(
        `number.ilike.${searchPattern},title.ilike.${searchPattern},text.ilike.${searchPattern},paragraphs::text.ilike.${searchPattern}`
      );
    }

    const { data: sections, error: sectionsError } = await query.order('number');

    // Filter sections by chapter prefix if needed
    let filteredSections = sections || [];
    if (chapterPrefix) {
      filteredSections = filteredSections.filter((section: any) =>
        section.number.startsWith(chapterPrefix)
      );
    }

    if (sectionsError) {
      throw sectionsError;
    }

    // Format sections for frontend consumption
    const formattedSections = filteredSections.map((section: any) => ({
      key: section.key,
      number: section.number,
      title: section.title,
      type: section.item_type || 'section',
      requirements: section.paragraphs || [],
      text: section.text,
      references: [],
      source_url: section.source_url,
      hasContent: !!(section.paragraphs && section.paragraphs.length > 0),
      subsections: [],
    }));

    const result = {
      code_id: codeId,
      code_title: code.title,
      total_sections: formattedSections.length,
      sections: formattedSections,
    };

    // Cache the result
    sectionsCache.set(cacheKey, result);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch sections',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Get a single section with its full context (including references)
export async function POST(request: NextRequest) {
  const { sectionKey } = await request.json();

  if (!sectionKey) {
    return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
  }

  try {
    const supabase = supabaseAdmin();

    // Get section data
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('key, number, title, text, item_type, paragraphs, source_url')
      .eq('key', sectionKey)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Get references for this section
    const { data: refs } = await supabase
      .from('section_references')
      .select(
        `
        target_section_key,
        citation_text,
        target:sections!section_references_target_section_key_fkey (
          key,
          number,
          title,
          text
        )
      `
      )
      .eq('source_section_key', sectionKey);

    const references = (refs || []).map((ref: any) => ({
      key: ref.target?.key,
      number: ref.target?.number,
      title: ref.target?.title,
      text: ref.target?.text,
      citation_text: ref.citation_text,
    }));

    const paragraphs = section.paragraphs || [];

    return NextResponse.json({
      key: section.key,
      number: section.number,
      title: section.title,
      type: section.item_type || 'section',
      requirements: paragraphs,
      text: section.text,
      references,
      source_url: section.source_url,
      hasContent: !!(paragraphs && paragraphs.length > 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch section',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

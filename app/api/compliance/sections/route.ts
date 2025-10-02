import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Cache for section data (in production, use Redis)
const sectionsCache = new Map<string, unknown>();

// Hardcoded list of definitional/scoping sections to exclude
// Only excludes: DEFINITIONS, APPLICATION, Scope sections, and General sections that are purely scoping
const DEFINITIONAL_SECTION_IDS = [
  // DEFINITIONS sections
  2080, 12,
  // APPLICATION sections
  2051, 20,
  // Scope sections
  2052, 640, 21, 254, 299, 363, 400, 487, 532, 618,
  // Where required
  2054,
  // Application based on use
  22, 232,
  // General sections that are ONLY scoping/references (no actual requirements)
  639, 111, 117, 118, 124, 157, 158, 167, 172, 177, 179, 180, 181, 185, 186, 191, 192, 200, 201,
  205, 207, 208, 209, 212, 213, 221, 222, 227, 228, 230, 231, 234, 235, 253, 256, 260, 266, 271,
  279, 282, 283, 294, 298, 301, 304, 312, 326, 362, 399, 486, 531, 617,
];

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
      .select('id, key, number, title, text, item_type, paragraphs, source_url')
      .eq('code_id', queryCodeId);

    if (!includeNonAssessable) {
      query = query.eq('drawing_assessable', true);
    }

    // Always exclude definitional/scoping sections
    query = query.not('id', 'in', `(${DEFINITIONAL_SECTION_IDS.join(',')})`);

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
      .select('id, key, number, title, text, item_type, paragraphs, source_url')
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

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Cache for section data (in production, use Redis)
const sectionsCache = new Map<string, unknown>();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codeId = searchParams.get('codeId');

  if (!codeId) {
    return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
  }

  try {
    // Check cache first
    if (sectionsCache.has(codeId)) {
      return NextResponse.json(sectionsCache.get(codeId));
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

    // Get all sections for this code
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('key, number, title, text, item_type, paragraphs, source_url')
      .eq('code_id', codeId)
      .order('number');

    if (sectionsError) {
      throw sectionsError;
    }

    // Format sections for frontend consumption
    const formattedSections = (sections || []).map((section: any) => ({
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
    sectionsCache.set(codeId, result);

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
      .select(`
        target_section_key,
        citation_text,
        target:sections!section_references_target_section_key_fkey (
          key,
          number,
          title,
          text
        )
      `)
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

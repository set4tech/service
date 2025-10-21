import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = supabaseAdmin();

  console.log('[GET /api/code-sections/[key]] Requested key:', key);
  console.log('[GET /api/code-sections/[key]] Key length:', key.length);
  console.log('[GET /api/code-sections/[key]] Key ends with:', key.slice(-10));

  try {
    // Fetch section from Supabase
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('*')
      .eq('key', key)
      .eq('never_relevant', false)
      .single();

    if (sectionError || !section) {
      console.error('[GET /api/code-sections/[key]] Section not found:', {
        requestedKey: key,
        error: sectionError,
      });
      return NextResponse.json(
        {
          error: 'Section not found',
          requestedKey: key,
        },
        { status: 404 }
      );
    }

    // Fetch references
    const { data: references } = await supabase
      .from('section_references')
      .select('target_section_key, citation_text, explicit')
      .eq('source_section_key', key);

    // Fetch referenced section details
    const referencedSections = [];
    if (references && references.length > 0) {
      const refKeys = references.map(r => r.target_section_key);
      const { data: refSections } = await supabase
        .from('sections')
        .select('key, number, title, text, paragraphs')
        .in('key', refKeys);

      if (refSections) {
        for (const refSection of refSections) {
          referencedSections.push({
            key: refSection.key,
            number: refSection.number,
            title: refSection.title,
            text: refSection.text,
            requirements: refSection.paragraphs,
          });
        }
      }
    }

    const paragraphs = section.paragraphs || [];
    const fullText = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';

    return NextResponse.json({
      ...section,
      fullText,
      references: referencedSections,
    });
  } catch (error) {
    console.error('Failed to fetch code section:', error);
    return NextResponse.json({ error: 'Failed to fetch code section' }, { status: 500 });
  }
}

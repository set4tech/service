import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = supabaseAdmin();

  try {
    // Fetch section from Supabase
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('*')
      .eq('key', key)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
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
        .select('key, number, title, paragraphs')
        .in('key', refKeys);

      if (refSections) {
        for (const refSection of refSections) {
          const paragraphs = refSection.paragraphs || [];
          const fullText = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';
          referencedSections.push({
            section: refSection,
            paragraphs,
            fullText,
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

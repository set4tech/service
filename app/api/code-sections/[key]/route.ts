import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = supabaseAdmin();

  console.log('[GET /api/code-sections/[key]] Requested key:', key);
  console.log('[GET /api/code-sections/[key]] Key length:', key.length);
  console.log('[GET /api/code-sections/[key]] Key ends with:', key.slice(-10));
  /*
  This route fetches code sectoins by key
  */

  try {
    // Fetch section with references using single RPC call
    const { data, error } = await supabase.rpc('get_section_with_references', {
      section_key: key,
    });

    if (error || !data) {
      console.error('[GET /api/code-sections/[key]] Section not found:', {
        requestedKey: key,
        error,
      });
      return NextResponse.json(
        {
          error: 'Section not found',
          requestedKey: key,
        },
        { status: 404 }
      );
    }

    const section = data.section;
    const paragraphs = section.paragraphs || [];
    const fullText = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : '';

    return NextResponse.json({
      ...section,
      fullText,
      references: data.references,
    });
  } catch (error) {
    console.error('Failed to fetch code section:', error);
    return NextResponse.json({ error: 'Failed to fetch code section' }, { status: 500 });
  }
}

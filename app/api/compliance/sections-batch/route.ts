import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Batch fetch multiple sections by their keys
export async function POST(request: NextRequest) {
  const { sectionKeys } = await request.json();

  if (!sectionKeys || !Array.isArray(sectionKeys) || sectionKeys.length === 0) {
    return NextResponse.json({ error: 'sectionKeys array is required' }, { status: 400 });
  }

  try {
    const supabase = supabaseAdmin();

    console.log('[sections-batch] Fetching sections for keys:', sectionKeys);

    // section_key is actually the section number, not the full key
    const { data: sections, error: sectionError } = await supabase
      .from('sections')
      .select('key, number, title, text')
      .in('number', sectionKeys);

    if (sectionError) {
      console.error('[sections-batch] Error fetching sections:', sectionError);
      return NextResponse.json({ error: sectionError.message }, { status: 500 });
    }

    console.log(
      '[sections-batch] Found sections:',
      sections?.length || 0,
      'of',
      sectionKeys.length,
      'requested'
    );
    console.log('[sections-batch] Sections data:', sections);

    return NextResponse.json(sections || []);
  } catch (error) {
    console.error('Failed to fetch sections:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch sections',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

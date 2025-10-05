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

    const { data: sections, error: sectionError } = await supabase
      .from('sections')
      .select('key, number, title, text')
      .in('key', sectionKeys);

    if (sectionError) {
      console.error('Error fetching sections:', sectionError);
      return NextResponse.json({ error: sectionError.message }, { status: 500 });
    }

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

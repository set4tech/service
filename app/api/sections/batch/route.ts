import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { keys } = await req.json();

    if (!keys || !Array.isArray(keys)) {
      return NextResponse.json({ error: 'keys array required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: sections, error } = await supabase
      .from('sections')
      .select('key, text, number, title')
      .in('key', keys);

    if (error) {
      console.error('Failed to fetch sections:', error);
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    return NextResponse.json(sections || []);
  } catch (error) {
    console.error('Error in sections batch endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}

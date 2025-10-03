import { supabaseAdmin } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const supabase = supabaseAdmin();

    // Update the section to mark it as never relevant
    const { data, error } = await supabase
      .from('sections')
      .update({ never_relevant: true })
      .eq('key', key)
      .select()
      .single();

    if (error) {
      console.error('Error marking section as never relevant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, section: data });
  } catch (error) {
    console.error('Error in mark-never-relevant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

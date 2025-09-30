import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { data: screenshots, error } = await supabase
      .from('screenshots')
      .select('*')
      .eq('check_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching screenshots:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(screenshots || []);
  } catch (error) {
    console.error('Failed to fetch screenshots:', error);
    return NextResponse.json({ error: 'Failed to fetch screenshots' }, { status: 500 });
  }
}

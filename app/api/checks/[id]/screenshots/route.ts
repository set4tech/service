import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from('screenshots')
      .select(
        `
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        )
      `
      )
      .eq('screenshot_check_assignments.check_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching screenshots:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten assignment metadata into screenshot objects
    const screenshots = (data || []).map((item: any) => ({
      ...item,
      is_original: item.screenshot_check_assignments?.[0]?.is_original,
      screenshot_check_assignments: undefined, // Remove nested structure
    }));

    return NextResponse.json(screenshots || []);
  } catch (error) {
    console.error('Failed to fetch screenshots:', error);
    return NextResponse.json({ error: 'Failed to fetch screenshots' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: screenshotId } = await params;
    const { checkIds } = await req.json();

    if (!Array.isArray(checkIds) || checkIds.length === 0) {
      return NextResponse.json({ error: 'checkIds must be a non-empty array' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Create assignments (is_original = false)
    const assignments = checkIds.map(checkId => ({
      screenshot_id: screenshotId,
      check_id: checkId,
      is_original: false,
    }));

    const { data, error } = await supabase
      .from('screenshot_check_assignments')
      .insert(assignments)
      .select();

    if (error) {
      console.error('Error creating assignments:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ assigned: data.length, assignments: data });
  } catch (error) {
    console.error('Failed to assign screenshot:', error);
    return NextResponse.json({ error: 'Failed to assign screenshot' }, { status: 500 });
  }
}

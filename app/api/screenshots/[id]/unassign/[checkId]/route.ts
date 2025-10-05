import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  try {
    const { id: screenshotId, checkId } = await params;
    const supabase = supabaseAdmin();

    // Check if this is the original assignment
    const { data: assignment } = await supabase
      .from('screenshot_check_assignments')
      .select('is_original')
      .eq('screenshot_id', screenshotId)
      .eq('check_id', checkId)
      .single();

    if (assignment?.is_original) {
      return NextResponse.json(
        { error: 'Cannot unassign screenshot from its original check' },
        { status: 400 }
      );
    }

    // Delete the assignment
    const { error } = await supabase
      .from('screenshot_check_assignments')
      .delete()
      .eq('screenshot_id', screenshotId)
      .eq('check_id', checkId);

    if (error) {
      console.error('Error unassigning screenshot:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to unassign screenshot:', error);
    return NextResponse.json({ error: 'Failed to unassign screenshot' }, { status: 500 });
  }
}

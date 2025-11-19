import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * POST /api/comments/[id]/screenshots
 *
 * Assigns screenshots to a comment
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: commentId } = await params;
    const body = await request.json();
    const supabase = supabaseAdmin();

    console.log('[comments] Assigning screenshots to comment:', commentId);

    const { screenshot_ids } = body;

    if (!screenshot_ids || !Array.isArray(screenshot_ids) || screenshot_ids.length === 0) {
      return NextResponse.json({ error: 'screenshot_ids array is required' }, { status: 400 });
    }

    // Create assignments
    const assignments = screenshot_ids.map((screenshot_id: string) => ({
      comment_id: commentId,
      screenshot_id,
    }));

    const { data, error } = await supabase
      .from('screenshot_comment_assignments')
      .insert(assignments)
      .select();

    if (error) {
      console.error('[comments] Failed to assign screenshots:', error);
      // Check for duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'One or more screenshots are already assigned to this comment' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to assign screenshots' }, { status: 500 });
    }

    console.log(`[comments] Assigned ${screenshot_ids.length} screenshots to comment ${commentId}`);

    return NextResponse.json({
      success: true,
      assignments: data,
      count: data.length,
    });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/comments/[id]/screenshots
 *
 * Removes screenshot assignments from a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commentId } = await params;
    const body = await request.json();
    const supabase = supabaseAdmin();

    console.log('[comments] Removing screenshots from comment:', commentId);

    const { screenshot_ids } = body;

    if (!screenshot_ids || !Array.isArray(screenshot_ids) || screenshot_ids.length === 0) {
      return NextResponse.json({ error: 'screenshot_ids array is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('screenshot_comment_assignments')
      .delete()
      .eq('comment_id', commentId)
      .in('screenshot_id', screenshot_ids);

    if (error) {
      console.error('[comments] Failed to remove screenshots:', error);
      return NextResponse.json({ error: 'Failed to remove screenshots' }, { status: 500 });
    }

    console.log(
      `[comments] Removed ${screenshot_ids.length} screenshot assignments from comment ${commentId}`
    );

    return NextResponse.json({
      success: true,
      removed_count: screenshot_ids.length,
    });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/comments/[id]
 *
 * Fetches a specific comment with its screenshots
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    console.log('[comments] Fetching comment:', id);

    const { data: comment, error } = await supabase
      .from('comments')
      .select(
        `
        *,
        screenshot_comment_assignments(
          screenshot:screenshots(
            id,
            screenshot_url,
            thumbnail_url,
            page_number,
            crop_coordinates,
            caption
          )
        )
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[comments] Database error:', error);
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Transform screenshots
    const screenshots =
      comment.screenshot_comment_assignments?.map((sca: any) => sca.screenshot).filter(Boolean) ||
      [];
    const { screenshot_comment_assignments: _assignments, ...rest } = comment;

    return NextResponse.json({
      comment: {
        ...rest,
        screenshots,
        primaryScreenshot: screenshots[0] || null,
      },
    });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/comments/[id]
 *
 * Updates a comment
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = supabaseAdmin();

    console.log('[comments] Updating comment:', id, body);

    // Extract fields that can be updated
    const {
      title,
      description,
      comment_type,
      severity,
      status,
      resolved_note,
      resolved_by,
      sheet_name,
      discipline,
      tags,
    } = body;

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (comment_type !== undefined) updates.comment_type = comment_type;
    if (severity !== undefined) updates.severity = severity;
    if (status !== undefined) {
      updates.status = status;
      // If resolving, set timestamp
      if (status === 'resolved' && !updates.resolved_at) {
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (resolved_note !== undefined) updates.resolved_note = resolved_note;
    if (resolved_by !== undefined) updates.resolved_by = resolved_by;
    if (sheet_name !== undefined) updates.sheet_name = sheet_name;
    if (discipline !== undefined) updates.discipline = discipline;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .update(updates)
      .eq('id', id)
      .select(
        `
        *,
        screenshot_comment_assignments(
          screenshot:screenshots(
            id,
            screenshot_url,
            thumbnail_url,
            page_number,
            crop_coordinates,
            caption
          )
        )
      `
      )
      .single();

    if (error) {
      console.error('[comments] Failed to update comment:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    console.log('[comments] Comment updated:', id);

    // Transform screenshots
    const screenshots =
      comment.screenshot_comment_assignments?.map((sca: any) => sca.screenshot).filter(Boolean) ||
      [];
    const { screenshot_comment_assignments: _assignments, ...rest } = comment;

    return NextResponse.json({
      comment: {
        ...rest,
        screenshots,
        primaryScreenshot: screenshots[0] || null,
      },
    });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/comments/[id]
 *
 * Deletes a comment (CASCADE will remove screenshot assignments)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    console.log('[comments] Deleting comment:', id);

    const { error } = await supabase.from('comments').delete().eq('id', id);

    if (error) {
      console.error('[comments] Failed to delete comment:', error);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    console.log('[comments] Comment deleted:', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

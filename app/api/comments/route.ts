import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * POST /api/comments
 *
 * Creates a new comment with optional screenshot assignments
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = supabaseAdmin();

    console.log('[comments] Creating new comment:', body);

    const {
      assessment_id,
      page_number,
      crop_coordinates,
      comment_type = 'coordination',
      title,
      description,
      severity = 'info',
      status = 'open',
      sheet_name,
      discipline,
      tags = [],
      screenshot_ids = [],
    } = body;

    // Validate required fields
    if (!assessment_id || !page_number || !title || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: assessment_id, page_number, title, description' },
        { status: 400 }
      );
    }

    // Create the comment
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .insert({
        assessment_id,
        page_number,
        crop_coordinates,
        comment_type,
        title,
        description,
        severity,
        status,
        sheet_name,
        discipline,
        tags,
      })
      .select()
      .single();

    if (commentError) {
      console.error('[comments] Failed to create comment:', commentError);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    console.log('[comments] Comment created:', comment.id);

    // Assign screenshots if provided
    if (screenshot_ids && screenshot_ids.length > 0) {
      const assignments = screenshot_ids.map((screenshot_id: string) => ({
        comment_id: comment.id,
        screenshot_id,
      }));

      const { error: assignmentError } = await supabase
        .from('screenshot_comment_assignments')
        .insert(assignments);

      if (assignmentError) {
        console.error('[comments] Failed to assign screenshots:', assignmentError);
        // Don't fail the entire request, just log the error
      } else {
        console.log(`[comments] Assigned ${screenshot_ids.length} screenshots to comment`);
      }
    }

    // Fetch the complete comment with screenshots
    const { data: completeComment, error: fetchError } = await supabase
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
      .eq('id', comment.id)
      .single();

    if (fetchError) {
      console.error('[comments] Failed to fetch complete comment:', fetchError);
      // Return the basic comment at least
      return NextResponse.json({ comment }, { status: 201 });
    }

    // Transform screenshots
    const screenshots =
      completeComment.screenshot_comment_assignments
        ?.map((sca: any) => sca.screenshot)
        .filter(Boolean) || [];
    const { screenshot_comment_assignments: _, ...rest } = completeComment;

    return NextResponse.json(
      {
        comment: {
          ...rest,
          screenshots,
          primaryScreenshot: screenshots[0] || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

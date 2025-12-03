import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/assessments/[id]/comments
 *
 * Fetches all comments for an assessment with their screenshots
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const supabase = supabaseAdmin();

    console.warn('[comments] Fetching comments for assessment:', assessmentId);

    // Fetch comments with their screenshots (LEFT JOIN, so comments without screenshots are included)
    const { data: comments, error } = await supabase
      .from('comments')
      .select(
        `
        id,
        assessment_id,
        page_number,
        crop_coordinates,
        comment_type,
        title,
        description,
        severity,
        status,
        resolved_note,
        resolved_at,
        resolved_by,
        created_at,
        created_by,
        updated_at,
        sheet_name,
        discipline,
        tags,
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
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[comments] Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    // Transform the data to flatten screenshots and convert to camelCase for frontend
    const transformedComments = comments?.map((comment: any) => {
      const screenshots =
        comment.screenshot_comment_assignments?.map((sca: any) => sca.screenshot).filter(Boolean) ||
        [];

      // Remove the junction table from response
      const { screenshot_comment_assignments: _assignments, ...rest } = comment;

      return {
        commentId: rest.id,
        assessmentId: rest.assessment_id,
        pageNumber: rest.page_number,
        bounds: rest.crop_coordinates,
        commentType: rest.comment_type,
        title: rest.title,
        description: rest.description,
        severity: rest.severity,
        status: rest.status,
        resolvedNote: rest.resolved_note,
        resolvedAt: rest.resolved_at,
        resolvedBy: rest.resolved_by,
        createdAt: rest.created_at,
        createdBy: rest.created_by,
        updatedAt: rest.updated_at,
        sheetName: rest.sheet_name,
        discipline: rest.discipline,
        tags: rest.tags,
        screenshots: screenshots.map((s: any) => ({
          id: s.id,
          url: s.screenshot_url,
          thumbnailUrl: s.thumbnail_url,
          pageNumber: s.page_number,
          bounds: s.crop_coordinates,
        })),
        primaryScreenshot: screenshots[0]
          ? {
              id: screenshots[0].id,
              url: screenshots[0].screenshot_url,
              thumbnailUrl: screenshots[0].thumbnail_url,
              pageNumber: screenshots[0].page_number,
              bounds: screenshots[0].crop_coordinates,
            }
          : null,
      };
    });

    console.warn(`[comments] Found ${transformedComments?.length || 0} comments`);

    return NextResponse.json({
      comments: transformedComments || [],
      count: transformedComments?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[comments] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

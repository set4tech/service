import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/assessment-data/[id]
 *
 * Consolidated endpoint that fetches all data needed for PDFViewer initialization:
 * - Measurements (for a specific project + page)
 * - Calibration (for a specific project + page)
 * - Screenshots (for the assessment)
 * - PDF Scale (for the assessment)
 *
 * Query Parameters:
 * - projectId: UUID of the project (required for measurements/calibration)
 * - pageNumber: Page number to fetch data for (required for measurements/calibration)
 * - include: Comma-separated list of data to fetch (optional, defaults to all)
 *            Options: measurements, calibration, screenshots, pdf_scale
 *
 * Example:
 * /api/assessment-data/[id]?projectId=xxx&pageNumber=1&include=measurements,calibration,screenshots,pdf_scale
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const pageNumber = searchParams.get('pageNumber');
    const includeParam = searchParams.get('include');

    // Parse which data to include
    const includeAll = !includeParam;
    const include = includeParam ? includeParam.split(',').map(s => s.trim()) : [];
    const shouldInclude = (key: string) => includeAll || include.includes(key);

    const supabase = supabaseAdmin();

    // Prepare promises for parallel fetching
    const promises: Record<string, Promise<any>> = {};

    // Fetch measurements if requested
    if (shouldInclude('measurements') && projectId && pageNumber) {
      promises.measurements = (async () => {
        const { data, error } = await supabase
          .from('pdf_measurements')
          .select('*')
          .eq('project_id', projectId)
          .eq('page_number', parseInt(pageNumber))
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[assessment-data] Error fetching measurements:', error);
          throw error;
        }
        return data || [];
      })();
    }

    // Fetch calibration if requested
    if (shouldInclude('calibration') && projectId && pageNumber) {
      promises.calibration = (async () => {
        const { data, error } = await supabase
          .from('pdf_scale_calibrations')
          .select('*')
          .eq('project_id', projectId)
          .eq('page_number', parseInt(pageNumber))
          .maybeSingle();

        if (error) {
          console.error('[assessment-data] Error fetching calibration:', error);
          throw error;
        }
        return data || null;
      })();
    }

    // Fetch screenshots if requested
    if (shouldInclude('screenshots') && assessmentId) {
      promises.screenshots = (async () => {
        // Fetch assigned screenshots for this assessment via checks
        const assignedQuery = supabase
          .from('screenshots')
          .select(
            `
            *,
            screenshot_check_assignments!inner(
              check_id,
              is_original,
              assigned_at,
              checks!inner(
                assessment_id,
                code_section_number,
                code_section_title
              )
            ),
            element_groups(id, name, slug)
          `
          )
          .eq('screenshot_check_assignments.checks.assessment_id', assessmentId)
          .order('created_at', { ascending: false });

        const { data: assignedData, error: assignedError } = await assignedQuery;

        if (assignedError) {
          console.error('[assessment-data] Error fetching assigned screenshots:', assignedError);
          throw assignedError;
        }

        // Flatten assignment metadata
        const assignedScreenshots = (assignedData || []).map((item: any) => ({
          ...item,
          check_id: item.screenshot_check_assignments?.[0]?.check_id,
          is_original: item.screenshot_check_assignments?.[0]?.is_original,
          check_section_number: item.screenshot_check_assignments?.[0]?.checks?.code_section_number,
          check_section_title: item.screenshot_check_assignments?.[0]?.checks?.code_section_title,
          screenshot_check_assignments: undefined,
        }));

        // Fetch all screenshots for this assessment by URL pattern
        const assignedIds = assignedScreenshots.map(s => s.id);
        const allScreenshotsQuery = supabase
          .from('screenshots')
          .select('*')
          .like('screenshot_url', `%${assessmentId}%`)
          .order('created_at', { ascending: false });

        const { data: allScreenshotsData, error: allScreenshotsError } = await allScreenshotsQuery;

        if (allScreenshotsError) {
          console.error('[assessment-data] Error fetching all screenshots:', allScreenshotsError);
          throw allScreenshotsError;
        }

        // Filter out assigned screenshots
        const unassignedData = (allScreenshotsData || []).filter(
          (screenshot: any) => !assignedIds.includes(screenshot.id)
        );

        // Mark unassigned screenshots
        const unassignedScreenshots = unassignedData.map((item: any) => ({
          ...item,
          check_id: null,
          is_original: false,
          check_section_number: null,
          check_section_title: 'Unassigned',
        }));

        return [...assignedScreenshots, ...unassignedScreenshots];
      })();
    }

    // Fetch PDF scale if requested
    if (shouldInclude('pdf_scale') && assessmentId) {
      promises.pdf_scale = (async () => {
        const { data, error } = await supabase
          .from('assessments')
          .select('pdf_scale')
          .eq('id', assessmentId)
          .single();

        if (error) {
          console.error('[assessment-data] Error fetching pdf_scale:', error);
          throw error;
        }
        return data?.pdf_scale || 2.0;
      })();
    }

    // Execute all promises in parallel
    const results = await Promise.all(
      Object.entries(promises).map(async ([key, promise]) => {
        try {
          const value = await promise;
          return [key, value];
        } catch (error) {
          console.error(`[assessment-data] Error fetching ${key}:`, error);
          // Return null for failed requests rather than failing the entire request
          return [key, null];
        }
      })
    );

    // Convert results array back to object
    const data = Object.fromEntries(results);

    return NextResponse.json({
      success: true,
      data: {
        measurements: data.measurements ?? null,
        calibration: data.calibration ?? null,
        screenshots: data.screenshots ?? null,
        pdf_scale: data.pdf_scale ?? null,
      },
    });
  } catch (error) {
    console.error('[assessment-data] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        data: {
          measurements: null,
          calibration: null,
          screenshots: null,
          pdf_scale: null,
        },
      },
      { status: 500 }
    );
  }
}

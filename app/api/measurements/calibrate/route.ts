import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/measurements/calibrate?projectId=xxx&pageNumber=1
// Fetch calibration for a project page
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const pageNumber = searchParams.get('pageNumber');

    if (!projectId || !pageNumber) {
      return NextResponse.json({ error: 'projectId and pageNumber are required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: calibration, error } = await supabase
      .from('pdf_scale_calibrations')
      .select('*')
      .eq('project_id', projectId)
      .eq('page_number', parseInt(pageNumber))
      .maybeSingle();

    if (error) {
      console.error('[calibration] Error fetching calibration:', error);
      return NextResponse.json({ error: 'Failed to fetch calibration' }, { status: 500 });
    }

    return NextResponse.json({ calibration: calibration || null });
  } catch (error) {
    console.error('[calibration] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Parse scale notation like "1/8"=1'-0" and return scale ratio (paper inches per real inch)
function parseScaleNotation(notation: string): number | null {
  try {
    // Match patterns like: 1/8"=1'-0", 1/4"=1', 1"=10', 3/16"=1'-0"
    const match = notation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
    if (!match) return null;

    const [, paperInchStr, realFeetStr, realInchesStr] = match;

    // Parse paper inches (could be fraction like "1/8")
    let paperInches: number;
    if (paperInchStr.includes('/')) {
      const [num, denom] = paperInchStr.split('/').map(Number);
      paperInches = num / denom;
    } else {
      paperInches = parseFloat(paperInchStr);
    }

    // Parse real world measurement
    const realFeet = parseFloat(realFeetStr);
    const realInches = realInchesStr ? parseFloat(realInchesStr) : 0;
    const realTotalInches = realFeet * 12 + realInches;

    // Scale ratio: paper inches per real inch
    return paperInches / realTotalInches;
  } catch {
    return null;
  }
}

// POST /api/measurements/calibrate
// Create or update calibration for a page (upsert)
// Supports two methods:
// 1. Page Size Method: scale_notation + print_width/height_inches
// 2. Known Length Method: calibration_line_start/end + known_distance_inches
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      project_id,
      page_number,
      method, // 'page-size' or 'known-length'
      // Page Size Method fields
      scale_notation,
      print_width_inches,
      print_height_inches,
      pdf_width_points,
      pdf_height_points,
      // Known Length Method fields
      calibration_line_start,
      calibration_line_end,
      known_distance_inches,
    } = body;

    // Basic validation
    if (!project_id || !page_number || !method) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, page_number, method' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    let calibrationData: {
      project_id: string;
      page_number: number;
      pixels_per_inch: number;
      scale_notation: string | null;
      print_width_inches: number | null;
      print_height_inches: number | null;
      calibration_line_start: { x: number; y: number } | null;
      calibration_line_end: { x: number; y: number } | null;
      known_distance_inches: number | null;
    };

    if (method === 'page-size') {
      // Validate page size method fields
      if (
        !scale_notation ||
        !print_width_inches ||
        !print_height_inches ||
        !pdf_width_points ||
        !pdf_height_points
      ) {
        return NextResponse.json(
          {
            error:
              'Page size method requires: scale_notation, print_width_inches, print_height_inches, pdf_width_points, pdf_height_points',
          },
          { status: 400 }
        );
      }

      // Parse and validate scale notation
      const scaleRatio = parseScaleNotation(scale_notation);
      if (scaleRatio === null) {
        return NextResponse.json(
          { error: 'Invalid scale notation. Use format like: 1/8"=1\'-0"' },
          { status: 400 }
        );
      }

      // Validate print dimensions
      const printWidth = parseFloat(print_width_inches);
      const printHeight = parseFloat(print_height_inches);
      if (isNaN(printWidth) || isNaN(printHeight) || printWidth <= 0 || printHeight <= 0) {
        return NextResponse.json({ error: 'Invalid print dimensions' }, { status: 400 });
      }

      // Calculate pixels_per_inch for storage (though it's recalculated client-side)
      // PDF spec: 72 points = 1 inch
      const pdfWidthInches = parseFloat(pdf_width_points) / 72;
      const printScaleFactor = printWidth / pdfWidthInches;
      // This is a reference value - actual calculation happens client-side with canvas dimensions
      const pixelsPerInch = 72 / printScaleFactor;

      calibrationData = {
        project_id,
        page_number: parseInt(page_number),
        scale_notation,
        print_width_inches: printWidth,
        print_height_inches: printHeight,
        pixels_per_inch: pixelsPerInch,
        calibration_line_start: null,
        calibration_line_end: null,
        known_distance_inches: null,
      };
    } else if (method === 'known-length') {
      // Validate known length method fields
      if (!calibration_line_start || !calibration_line_end || !known_distance_inches) {
        return NextResponse.json(
          {
            error:
              'Known length method requires: calibration_line_start, calibration_line_end, known_distance_inches',
          },
          { status: 400 }
        );
      }

      // Validate line coordinates
      if (
        typeof calibration_line_start.x !== 'number' ||
        typeof calibration_line_start.y !== 'number' ||
        typeof calibration_line_end.x !== 'number' ||
        typeof calibration_line_end.y !== 'number'
      ) {
        return NextResponse.json({ error: 'Invalid line coordinates' }, { status: 400 });
      }

      // Validate known distance
      const knownDist = parseFloat(known_distance_inches);
      if (isNaN(knownDist) || knownDist <= 0) {
        return NextResponse.json({ error: 'Invalid known distance' }, { status: 400 });
      }

      // Calculate line length in pixels
      const dx = calibration_line_end.x - calibration_line_start.x;
      const dy = calibration_line_end.y - calibration_line_start.y;
      const lineLengthPixels = Math.sqrt(dx * dx + dy * dy);

      if (lineLengthPixels === 0) {
        return NextResponse.json({ error: 'Calibration line has zero length' }, { status: 400 });
      }

      // Calculate pixels_per_inch from the line
      const pixelsPerInch = lineLengthPixels / knownDist;

      calibrationData = {
        project_id,
        page_number: parseInt(page_number),
        scale_notation: null,
        print_width_inches: null,
        print_height_inches: null,
        pixels_per_inch: pixelsPerInch,
        calibration_line_start,
        calibration_line_end,
        known_distance_inches: knownDist,
      };
    } else {
      return NextResponse.json(
        { error: 'Invalid method. Must be "page-size" or "known-length"' },
        { status: 400 }
      );
    }

    // Store the calibration
    const { data: calibration, error } = await supabase
      .from('pdf_scale_calibrations')
      .upsert(calibrationData, {
        onConflict: 'project_id,page_number',
      })
      .select()
      .single();

    if (error) {
      console.error('[calibration] Error saving calibration:', error);
      return NextResponse.json({ error: 'Failed to save calibration' }, { status: 500 });
    }

    // Measurements will be recalculated client-side when loaded
    // No need to update them here as the calculation is dynamic

    return NextResponse.json({ calibration }, { status: 201 });
  } catch (error) {
    console.error('[calibration] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to update all measurements on a page with calibration
// Currently unused but kept for future use

async function _updateMeasurementsWithCalibration(
  supabase: ReturnType<typeof supabaseAdmin>,
  projectId: string,
  pageNumber: number,
  pixelsPerInch: number
) {
  try {
    // Fetch all measurements for this page
    const { data: measurements, error: fetchError } = await supabase
      .from('pdf_measurements')
      .select('*')
      .eq('project_id', projectId)
      .eq('page_number', pageNumber);

    if (fetchError || !measurements) {
      console.error('[calibration] Error fetching measurements for update:', fetchError);
      return;
    }

    // Update each measurement with calculated real distance
    const updates = measurements.map((m: { id: string; pixels_distance: string }) => ({
      id: m.id,
      real_distance_inches: parseFloat(m.pixels_distance) / pixelsPerInch,
    }));

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('pdf_measurements')
        .upsert(updates, { onConflict: 'id' });

      if (updateError) {
        console.error('[calibration] Error updating measurements:', updateError);
      }
    }
  } catch (error) {
    console.error('[calibration] Error in updateMeasurementsWithCalibration:', error);
  }
}

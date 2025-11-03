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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, page_number, scale_notation } = body;

    // Validation
    if (!project_id || !page_number || !scale_notation) {
      return NextResponse.json(
        {
          error: 'Missing required fields: project_id, page_number, scale_notation',
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

    const supabase = supabaseAdmin();

    // Store the scale notation - pixels_per_inch will be calculated client-side
    // based on the PDF page dimensions
    const { data: calibration, error } = await supabase
      .from('pdf_scale_calibrations')
      .upsert(
        {
          project_id,
          page_number: parseInt(page_number),
          scale_notation,
          pixels_per_inch: scaleRatio, // Temporarily store scale ratio - will be updated when we have better solution
          calibration_line_start: null,
          calibration_line_end: null,
          known_distance_inches: null,
        },
        {
          onConflict: 'project_id,page_number',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('[calibration] Error saving calibration:', error);
      return NextResponse.json({ error: 'Failed to save calibration' }, { status: 500 });
    }

    // After calibration is saved, update all measurements on this page
    // For now, set real_distance_inches to null - will be calculated client-side
    const { error: updateError } = await supabase
      .from('pdf_measurements')
      .update({ real_distance_inches: null })
      .eq('project_id', project_id)
      .eq('page_number', parseInt(page_number));

    if (updateError) {
      console.error('[calibration] Error updating measurements:', updateError);
    }

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

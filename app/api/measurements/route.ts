import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/measurements?projectId=xxx&pageNumber=1
// Fetch all measurements for a project page
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const pageNumber = searchParams.get('pageNumber');

    if (!projectId || !pageNumber) {
      return NextResponse.json({ error: 'projectId and pageNumber are required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: measurements, error } = await supabase
      .from('pdf_measurements')
      .select('*')
      .eq('project_id', projectId)
      .eq('page_number', parseInt(pageNumber))
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[measurements] Error fetching measurements:', error);
      return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 });
    }

    return NextResponse.json({ measurements: measurements || [] });
  } catch (error) {
    console.error('[measurements] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/measurements
// Create a new measurement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      project_id,
      page_number,
      start_point,
      end_point,
      pixels_distance,
      real_distance_inches,
      label,
      color,
    } = body;

    // Validation
    if (!project_id || !page_number || !start_point || !end_point || !pixels_distance) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: project_id, page_number, start_point, end_point, pixels_distance',
        },
        { status: 400 }
      );
    }

    // Validate point structure
    if (
      typeof start_point.x !== 'number' ||
      typeof start_point.y !== 'number' ||
      typeof end_point.x !== 'number' ||
      typeof end_point.y !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid point structure: must have numeric x and y coordinates' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: measurement, error } = await supabase
      .from('pdf_measurements')
      .insert({
        project_id,
        page_number: parseInt(page_number),
        start_point,
        end_point,
        pixels_distance: parseFloat(pixels_distance),
        real_distance_inches: real_distance_inches ? parseFloat(real_distance_inches) : null,
        label: label || null,
        color: color || '#3B82F6',
      })
      .select()
      .single();

    if (error) {
      console.error('[measurements] Error creating measurement:', error);
      return NextResponse.json({ error: 'Failed to create measurement' }, { status: 500 });
    }

    return NextResponse.json({ measurement }, { status: 201 });
  } catch (error) {
    console.error('[measurements] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/measurements?id=xxx
// Delete a measurement
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase.from('pdf_measurements').delete().eq('id', id);

    if (error) {
      console.error('[measurements] Error deleting measurement:', error);
      return NextResponse.json({ error: 'Failed to delete measurement' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[measurements] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// GET /api/assessments/[id]/pdf-scale
// Fetch the PDF scale setting for an assessment
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { data: assessment, error } = await supabase
      .from('assessments')
      .select('pdf_scale')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[pdf-scale] Error fetching pdf_scale:', error);
      return NextResponse.json({ error: 'Failed to fetch pdf_scale' }, { status: 500 });
    }

    return NextResponse.json({ pdf_scale: assessment?.pdf_scale || 2.0 });
  } catch (error) {
    console.error('[pdf-scale] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/assessments/[id]/pdf-scale
// Update the PDF scale setting for an assessment
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { pdf_scale } = body;

    if (typeof pdf_scale !== 'number' || pdf_scale < 1 || pdf_scale > 8) {
      return NextResponse.json(
        { error: 'pdf_scale must be a number between 1 and 8' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase.from('assessments').update({ pdf_scale }).eq('id', id);

    if (error) {
      console.error('[pdf-scale] Error updating pdf_scale:', error);
      return NextResponse.json({ error: 'Failed to update pdf_scale' }, { status: 500 });
    }

    return NextResponse.json({ success: true, pdf_scale });
  } catch (error) {
    console.error('[pdf-scale] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

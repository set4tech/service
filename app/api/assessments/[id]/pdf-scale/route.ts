import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from('assessments')
      .select('pdf_scale')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching pdf_scale:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pdf_scale: data?.pdf_scale || 2.0 });
  } catch (error) {
    console.error('Error in GET /api/assessments/[id]/pdf-scale:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { pdf_scale } = body;

    if (typeof pdf_scale !== 'number' || pdf_scale < 1 || pdf_scale > 6) {
      return NextResponse.json(
        { error: 'pdf_scale must be a number between 1 and 6' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { error } = await supabase.from('assessments').update({ pdf_scale }).eq('id', id);

    if (error) {
      console.error('Error updating pdf_scale:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/assessments/[id]/pdf-scale:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

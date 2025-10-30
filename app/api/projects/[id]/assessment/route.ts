import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const supabase = supabaseAdmin();

    // Check if assessment exists for this project
    const { data: existingAssessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('project_id', projectId)
      .single();

    if (existingAssessment) {
      return NextResponse.json({ assessmentId: existingAssessment.id });
    }

    // Create new assessment if none exists (no chapters selected via GET)
    const { data: newAssessment, error } = await supabase
      .from('assessments')
      .insert({
        project_id: projectId,
        status: 'in_progress',
        total_sections: 0,
        assessed_sections: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating assessment:', error);
      return NextResponse.json({ error: 'Failed to create assessment' }, { status: 500 });
    }

    return NextResponse.json({ assessmentId: newAssessment.id });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const supabase = supabaseAdmin();

    console.log('[Assessment API] Creating assessment for project:', projectId);
    console.log('[Assessment API] Selected chapters:', body.selected_chapter_ids);

    // Check if assessment exists for this project
    const { data: existingAssessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('project_id', projectId)
      .single();

    if (existingAssessment) {
      console.log('[Assessment API] Assessment already exists, returning existing ID');
      return NextResponse.json({ assessmentId: existingAssessment.id });
    }

    // Create new assessment with selected chapters
    const { data: newAssessment, error } = await supabase
      .from('assessments')
      .insert({
        project_id: projectId,
        status: 'in_progress',
        total_sections: 0,
        assessed_sections: 0,
        selected_chapter_ids: body.selected_chapter_ids || [],
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Assessment API] Error creating assessment:', error);
      return NextResponse.json({ error: 'Failed to create assessment' }, { status: 500 });
    }

    console.log('[Assessment API] Created assessment:', newAssessment.id);
    return NextResponse.json({ assessmentId: newAssessment.id });
  } catch (error) {
    console.error('[Assessment API] Server error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        `
        *,
        customer:customers(*),
        assessments(id)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      // console.error('Error fetching projects:', error);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    return NextResponse.json(projects || []);
  } catch {
    // console.error('Server error');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = supabaseAdmin();

    const { data: project, error } = await supabase.from('projects').insert(body).select().single();

    if (error) {
      // console.error('Error creating project:', error);
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return NextResponse.json(project);
  } catch {
    // console.error('Server error');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

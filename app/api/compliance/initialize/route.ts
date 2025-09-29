import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const { projectId, codeId } = await request.json();

  if (!projectId || !codeId) {
    return NextResponse.json(
      { error: 'projectId and codeId are required' },
      { status: 400 }
    );
  }

  try {
    // Create a new compliance session
    const { data: session, error: sessionError } = await supabase
      .from('compliance_sessions')
      .insert({
        project_id: projectId,
        code_id: codeId,
        status: 'in_progress',
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Load sections from pre-generated JSON
    // In production, this could be stored in Supabase or fetched from Neo4j
    const sectionsModule = await import('@/data/cbc_sections.json');
    const sectionsData = sectionsModule.default;

    // Initialize section checks for each section
    interface SectionData {
      key: string;
      number: string;
      title: string;
    }

    const sectionChecks = sectionsData.sections.map((section: SectionData) => ({
      session_id: session.id,
      section_key: section.key,
      section_number: section.number,
      section_title: section.title,
      status: 'pending',
      is_cloneable: false,
    }));

    // Batch insert section checks
    const { error: checksError } = await supabase
      .from('section_checks')
      .insert(sectionChecks);

    if (checksError) throw checksError;

    return NextResponse.json({
      session,
      sections: sectionsData.sections,
      totalSections: sectionsData.total_sections,
    });

  } catch (error) {
    console.error('Error initializing compliance session:', error);
    return NextResponse.json(
      { error: 'Failed to initialize compliance session', details: error.message },
      { status: 500 }
    );
  }
}
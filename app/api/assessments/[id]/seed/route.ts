import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const assessmentId = params.id;
    const supabase = supabaseAdmin();

    // Check if assessment exists
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if already has checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', assessmentId)
      .limit(1);

    if (existingChecks && existingChecks.length > 0) {
      return NextResponse.json({
        message: 'Assessment already has checks',
        count: existingChecks.length,
      });
    }

    // Default to California Building Code
    const codeId = 'ICC+CBC_Chapter11A_11B+2025+CA';

    // Get the code assembly from Neo4j
    const assembly = await getCodeAssembly(codeId);
    const sections = assembly.sections || [];

    if (sections.length === 0) {
      return NextResponse.json(
        {
          error: 'No sections found in code assembly',
          codeId,
        },
        { status: 404 }
      );
    }

    // Create check records for each section
    const checkRows = sections.map((s: any) => ({
      assessment_id: assessmentId,
      code_section_key: s.key,
      code_section_number: s.number,
      code_section_title: s.title,
      check_name: `${s.number} - ${s.title}`,
      check_location: '',
      status: 'pending',
    }));

    // Insert all checks
    const { error: insertError } = await supabase.from('checks').insert(checkRows);

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to seed checks', details: insertError.message },
        { status: 500 }
      );
    }

    // Update assessment with total sections count
    await supabase
      .from('assessments')
      .update({ total_sections: checkRows.length })
      .eq('id', assessmentId);

    return NextResponse.json({
      success: true,
      seeded: checkRows.length,
      codeId,
    });
  } catch (error) {
    console.error('Error seeding assessment:', error);
    return NextResponse.json(
      {
        error: 'Failed to seed assessment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

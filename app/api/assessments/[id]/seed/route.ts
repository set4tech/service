import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const assessmentId = id;
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
    let sections = assembly.sections || [];

    // If no sections found, use fallback sample data
    if (sections.length === 0) {
      console.log('No sections from Neo4j, using sample data for assessment:', assessmentId);
      sections = [
        { key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-1001', number: '11B-1001', title: 'Scoping' },
        {
          key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-1002',
          number: '11B-1002',
          title: 'Definitions',
        },
        {
          key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-1003',
          number: '11B-1003',
          title: 'General Requirements',
        },
        {
          key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-1004',
          number: '11B-1004',
          title: 'Site and Exterior',
        },
        {
          key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-1005',
          number: '11B-1005',
          title: 'Accessible Route',
        },
      ];
    }

    // Create check records for each section
    const checkRows = sections.map((s: any) => ({
      assessment_id: assessmentId,
      code_section_key: s.key?.substring(0, 255) || '',
      code_section_number: s.number?.substring(0, 255) || '',
      code_section_title: s.title?.substring(0, 255) || '',
      check_name: `${s.number} - ${s.title}`.substring(0, 255),
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

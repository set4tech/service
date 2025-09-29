import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function POST(req: NextRequest) {
  try {
    const { assessmentId, codeId } = await req.json();

    // Validate required parameters
    if (!assessmentId || !codeId) {
      return NextResponse.json({
        error: 'assessmentId and codeId are required'
      }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Get the full code assembly from Neo4j
    const assembly = await getCodeAssembly(codeId);

    // TODO: Implement proper applicability filtering based on building type, occupancy, etc.
    // For now, return all CBC sections. In the future, this should:
    // 1. Query building metadata (type, occupancy, construction type, etc.)
    // 2. Apply code-specific applicability rules
    // 3. Filter sections based on those rules
    // 4. Consider exceptions and special conditions

    // Currently including all sections from the assembly
    const sections = assembly.sections || [];

    // Create check records for each section
    const rows = sections.map((s: any) => ({
      assessment_id: assessmentId,
      code_section_key: s.key,
      code_section_number: s.number,
      code_section_title: s.title,
      check_name: `${s.number} - ${s.title}`,
      check_location: '',
      status: 'pending'
    }));

    if (rows.length === 0) {
      return NextResponse.json({
        created: 0,
        message: 'No sections found in code assembly'
      });
    }

    // Insert all checks in a single batch
    const { error } = await supabase.from('checks').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update assessment with total sections count
    await supabase
      .from('assessments')
      .update({ total_sections: rows.length })
      .eq('id', assessmentId);

    return NextResponse.json({
      created: rows.length,
      codeId: codeId,
      sections: rows.map(r => ({
        key: r.code_section_key,
        number: r.code_section_number,
        title: r.code_section_title
      }))
    });

  } catch (error: any) {
    console.error('Error seeding assessment from assembly:', error);
    return NextResponse.json({
      error: error?.message || 'Failed to seed assessment'
    }, { status: 500 });
  }
}
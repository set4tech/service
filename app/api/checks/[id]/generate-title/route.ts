import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generateViolationTitle } from '@/lib/ai/generate-title';

/**
 * POST /api/checks/:id/generate-title
 *
 * Generates a human-readable title for a violation and stores it in the database.
 * Uses GPT-4o-mini to convert technical violations into natural language.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  console.log('[generate-title] Generating title for check:', checkId);

  try {
    // Fetch check with latest analysis and section content
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select(
        `
        id,
        section_id,
        code_section_number,
        code_section_title,
        check_name,
        element_group_id
      `
      )
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      console.error('[generate-title] Failed to fetch check:', checkError);
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    // Get latest analysis run
    const { data: latestAnalysis } = await supabase
      .from('analysis_runs')
      .select('compliance_status, ai_reasoning')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get element group name if applicable
    let elementType: string | undefined;
    if (check.element_group_id) {
      const { data: elementGroup } = await supabase
        .from('element_groups')
        .select('name')
        .eq('id', check.element_group_id)
        .single();

      elementType = elementGroup?.name;
    }

    // Get section text for additional context
    let sectionText: string | undefined;
    if (check.section_id) {
      const { data: section } = await supabase
        .from('sections')
        .select('text')
        .eq('id', check.section_id)
        .single();

      sectionText = section?.text;
    }

    const aiReasoning = latestAnalysis?.ai_reasoning;

    // Generate the title
    const title = await generateViolationTitle({
      codeSectionNumber: check.code_section_number,
      codeSectionText: sectionText,
      aiReasoning,
      elementType,
      checkName: check.check_name,
    });

    console.log('[generate-title] Generated title:', title);

    // Store the title in the database
    const { error: updateError } = await supabase
      .from('checks')
      .update({ human_readable_title: title })
      .eq('id', checkId);

    if (updateError) {
      console.error('[generate-title] Failed to update check:', updateError);
      return NextResponse.json({ error: 'Failed to save title' }, { status: 500 });
    }

    return NextResponse.json({ title });
  } catch (error) {
    console.error('[generate-title] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

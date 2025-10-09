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
        code_section_key,
        code_section_number,
        code_section_title,
        check_name,
        element_group_id,
        latest_analysis_runs(
          compliance_status,
          ai_reasoning
        )
      `
      )
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      console.error('[generate-title] Failed to fetch check:', checkError);
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

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
    if (check.code_section_key) {
      const { data: section } = await supabase
        .from('sections')
        .select('text')
        .eq('key', check.code_section_key)
        .single();

      sectionText = section?.text;
    }

    // Extract AI reasoning from latest analysis
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    const aiReasoning = latestAnalysis?.ai_reasoning;

    // Generate the title
    const title = await generateViolationTitle({
      codeSectionNumber: check.code_section_number || check.code_section_key,
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

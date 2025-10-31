import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[Seed API] Starting seed for assessment:', id);
  const supabase = supabaseAdmin();

  try {
    // 1. Fetch assessment with selected chapters
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select(
        `
        id,
        project_id,
        seeding_status,
        selected_chapter_ids,
        projects (
          id,
          extracted_variables
        )
      `
      )
      .eq('id', id)
      .single();

    if (assessmentError || !assessment) {
      console.error('[Seed API] Assessment not found:', assessmentError);
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if assessment has selected chapters
    const chapterIds = assessment.selected_chapter_ids || [];
    if (chapterIds.length === 0) {
      console.log('[Seed API] No chapters selected for assessment');
      return NextResponse.json(
        { error: 'No chapters selected for this assessment. Please select chapters first.' },
        { status: 400 }
      );
    }

    console.log('[Seed API] Selected chapter IDs:', chapterIds);

    // Check if already completed
    if (assessment.seeding_status === 'completed') {
      console.log('[Seed API] Assessment already seeded, returning early');
      const { count } = await supabase
        .from('checks')
        .select('*', { count: 'exact', head: true })
        .eq('assessment_id', id);

      return NextResponse.json({
        status: 'completed',
        checks_created: count || 0,
        message: 'Assessment already seeded',
      });
    }

    // Set status to in_progress
    await supabase.from('assessments').update({ seeding_status: 'in_progress' }).eq('id', id);

    // 2. Fetch all sections for the selected chapters
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .in('chapter_id', chapterIds)
      .eq('drawing_assessable', true)
      .eq('never_relevant', false)
      .order('number');

    if (sectionsError) {
      console.error('[Seed API] Error fetching sections:', sectionsError);
      await supabase.from('assessments').update({ seeding_status: 'failed' }).eq('id', id);

      return NextResponse.json(
        { error: 'Database error: ' + sectionsError.message },
        { status: 500 }
      );
    }

    if (!sections || sections.length === 0) {
      console.log('[Seed API] No sections found for provided chapter IDs');
      await supabase.from('assessments').update({ seeding_status: 'completed' }).eq('id', id);

      return NextResponse.json({
        status: 'completed',
        checks_created: 0,
        message: 'No assessable sections found for selected chapters',
      });
    }

    console.log(`[Seed API] Found ${sections.length} sections to seed`);

    // 3. Check which sections already have checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('code_section_key')
      .eq('assessment_id', id);

    const existingKeys = new Set((existingChecks || []).map(c => c.code_section_key));
    const sectionsToAdd = sections.filter(s => !existingKeys.has(s.key));

    console.log(
      `[Seed API] ${existingKeys.size} checks already exist, adding ${sectionsToAdd.length} new checks`
    );

    let checksCreated = 0;

    // Only insert if there are new sections to add
    if (sectionsToAdd.length > 0) {
      const checkRows = sectionsToAdd.map(s => ({
        assessment_id: id,
        code_section_key: s.key,
        code_section_number: s.number,
        code_section_title: s.title,
        check_name: `${s.number} - ${s.title}`,
        status: 'pending',
        instance_label: null, // Section checks have no instance label
      }));

      // Insert checks - duplicates are prevented by unique constraint
      // If duplicates exist (from race conditions), we'll catch the error and continue
      const { data: insertedData, error: insertError } = await supabase
        .from('checks')
        .insert(checkRows)
        .select('id');

      if (insertError) {
        // Code 23505 is duplicate key violation - this is OK in race conditions
        if (insertError.code === '23505') {
          console.log('[Seed API] Some checks already exist (race condition), continuing...');
          checksCreated = 0; // These checks already existed
        } else {
          console.error('[Seed API] Error inserting checks:', insertError);
          await supabase.from('assessments').update({ seeding_status: 'failed' }).eq('id', id);

          return NextResponse.json(
            { error: 'Failed to create checks: ' + insertError.message },
            { status: 500 }
          );
        }
      } else {
        checksCreated = insertedData?.length || 0;
        console.log(`[Seed API] Successfully created ${checksCreated} checks`);
      }
    }

    // 4. Mark seeding as completed
    await supabase.from('assessments').update({ seeding_status: 'completed' }).eq('id', id);

    console.log(`[Seed API] Seeding completed. Created ${checksCreated} new checks`);

    return NextResponse.json({
      status: 'completed',
      checks_created: checksCreated,
      message: 'Assessment seeded successfully',
    });
  } catch (error) {
    console.error('[Seed API] Unexpected error:', error);

    // Try to mark as failed
    try {
      await supabaseAdmin().from('assessments').update({ seeding_status: 'failed' }).eq('id', id);
    } catch (updateError) {
      console.error('[Seed API] Failed to update status to failed:', updateError);
    }

    return NextResponse.json(
      {
        error: 'Failed to seed assessment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

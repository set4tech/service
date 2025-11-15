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

    // Check total sections before filtering
    const { count: totalSections } = await supabase
      .from('sections')
      .select('*', { count: 'exact', head: true })
      .in('chapter_id', chapterIds)
      .eq('never_relevant', false);

    console.log(`[Seed API] Total sections (before text filter): ${totalSections}`);

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

    // 2. Fetch all sections for the selected chapters in batches
    // Exclude sections without body text (header-only sections like "1001")
    // Supabase has a hard limit of 1000 rows per query, so we need to paginate
    let sections: any[] = [];
    let hasMore = true;
    let offset = 0;
    const batchSize = 1000;

    console.log('[Seed API] Fetching sections in batches...');

    while (hasMore) {
      const { data: batch, error: sectionsError } = await supabase
        .from('sections')
        .select('*')
        .in('chapter_id', chapterIds)
        .eq('never_relevant', false)
        .not('text', 'is', null)
        .neq('text', '')
        .order('number')
        .range(offset, offset + batchSize - 1);

      if (sectionsError) {
        console.error('[Seed API] Error fetching sections:', sectionsError);
        await supabase.from('assessments').update({ seeding_status: 'failed' }).eq('id', id);

        return NextResponse.json(
          { error: 'Database error: ' + sectionsError.message },
          { status: 500 }
        );
      }

      if (batch && batch.length > 0) {
        sections = sections.concat(batch);
        offset += batchSize;
        hasMore = batch.length === batchSize;
        console.log(
          `[Seed API] Fetched batch: ${batch.length} sections (total so far: ${sections.length})`
        );
      } else {
        hasMore = false;
      }
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

    console.log(
      `[Seed API] Found ${sections.length} sections with body text to seed (excluded ${(totalSections || 0) - sections.length} header-only sections)`
    );

    // 3. Check which sections already have checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('section_id')
      .eq('assessment_id', id);

    const existingIds = new Set((existingChecks || []).map(c => c.section_id));
    const sectionsToAdd = sections.filter(s => !existingIds.has(s.id));

    console.log(
      `[Seed API] ${existingIds.size} checks already exist, adding ${sectionsToAdd.length} new checks`
    );

    let checksCreated = 0;

    // Only insert if there are new sections to add
    if (sectionsToAdd.length > 0) {
      const checkRows = sectionsToAdd.map(s => ({
        assessment_id: id,
        section_id: s.id,
        // code_section_key removed - we get it via JOIN with sections table
        code_section_number: s.number,
        code_section_title: s.title,
        check_name: `${s.number} - ${s.title}`,
        status: 'pending',
        instance_label: null, // Section checks have no instance label
      }));

      // Insert checks in batches to avoid Supabase limits
      const batchSize = 1000;
      let totalInserted = 0;

      for (let i = 0; i < checkRows.length; i += batchSize) {
        const batch = checkRows.slice(i, i + batchSize);
        console.log(
          `[Seed API] Inserting batch ${i / batchSize + 1}/${Math.ceil(checkRows.length / batchSize)} (${batch.length} checks)`
        );

        const { data: insertedData, error: insertError } = await supabase
          .from('checks')
          .insert(batch)
          .select('id');

        if (insertError) {
          // Code 23505 is duplicate key violation - this is OK in race conditions
          if (insertError.code === '23505') {
            console.log(
              '[Seed API] Some checks in batch already exist (race condition), continuing...'
            );
          } else {
            console.error('[Seed API] Error inserting checks batch:', insertError);
            await supabase.from('assessments').update({ seeding_status: 'failed' }).eq('id', id);

            return NextResponse.json(
              { error: 'Failed to create checks: ' + insertError.message },
              { status: 500 }
            );
          }
        } else {
          totalInserted += insertedData?.length || 0;
        }
      }

      checksCreated = totalInserted;
      console.log(
        `[Seed API] Successfully created ${checksCreated} checks across ${Math.ceil(checkRows.length / batchSize)} batches`
      );
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

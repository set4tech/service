import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[Seed API] Starting seed for assessment:', id);
  const supabase = supabaseAdmin();

  try {
    // 1. Fetch assessment + project + variables
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select(
        `
        id,
        project_id,
        projects (
          id,
          selected_code_ids,
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

    // Check if already has checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', id)
      .limit(1);

    if (existingChecks && existingChecks.length > 0) {
      console.log('[Seed API] Assessment already has checks:', existingChecks.length);
      return NextResponse.json({
        message: 'Assessment already has checks',
        count: existingChecks.length,
      });
    }

    const variables = (assessment.projects as any)?.extracted_variables ?? {};
    const codeIds: string[] = (assessment.projects as any)?.selected_code_ids ?? [
      'ICC+CBC_Chapter11A_11B+2025+CA',
    ];

    // 2. Fetch ALL sections for selected codes (filter by drawing_assessable)
    const { data: allSections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .in('code_id', codeIds)
      .eq('drawing_assessable', true)
      .order('number');

    if (sectionsError || !allSections) {
      console.error('[Seed API] Failed to fetch sections:', sectionsError);
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    console.log('[Seed API] Found sections:', allSections.length);

    // 3. Initialize status
    await supabase
      .from('assessments')
      .update({
        seeding_status: 'in_progress',
        sections_total: allSections.length,
        sections_processed: 0,
      })
      .eq('id', id);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 4. Process first batch immediately, then continue in background
    const BATCH_SIZE = 10;
    const firstBatch = allSections.slice(0, BATCH_SIZE);

    let processedCount = 0;
    let includedCount = 0;

    // Process first batch synchronously
    try {
      console.log('[Seed API] Processing first batch of', firstBatch.length, 'sections');
      const prompt = buildBatchPrompt(firstBatch, variables);
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });

      const decisionsText = response.content[0].type === 'text' ? response.content[0].text : '[]';
      const decisions = JSON.parse(decisionsText);

      // Filter applicable sections
      const applicable = firstBatch.filter((section, idx) => decisions[idx]?.applies === true);
      console.log(
        '[Seed API] First batch applicable sections:',
        applicable.length,
        '/',
        firstBatch.length
      );

      // Insert checks for first batch
      if (applicable.length > 0) {
        const checkRows = applicable.map(s => ({
          assessment_id: id,
          code_section_key: s.key,
          code_section_number: s.number,
          code_section_title: s.title,
          check_name: `${s.number} - ${s.title}`,
          status: 'pending',
        }));

        const { error: insertError } = await supabase.from('checks').insert(checkRows);
        if (insertError) {
          console.error('[Seed API] Failed to insert checks:', insertError);
        } else {
          console.log('[Seed API] Successfully inserted', checkRows.length, 'checks');
        }
      }

      // Log first batch decisions
      const logRows = firstBatch.map((s, idx) => ({
        assessment_id: id,
        section_key: s.key,
        decision: decisions[idx]?.applies || false,
        decision_source: 'ai',
        decision_confidence: decisions[idx]?.confidence || 'low',
        reasons: [decisions[idx]?.reason || 'No reason provided'],
        details: {},
        building_params_hash: 'ai_hash',
        variables_snapshot: variables,
      }));

      await supabase.from('section_applicability_log').insert(logRows);

      processedCount = firstBatch.length;
      includedCount = applicable.length;

      await supabase
        .from('assessments')
        .update({ sections_processed: processedCount })
        .eq('id', id);
    } catch (error) {
      console.error('[Seed API] First batch processing error:', error);
    }

    // Start background processing for remaining batches (don't await)
    console.log(
      '[Seed API] Starting background processing for remaining',
      allSections.length - BATCH_SIZE,
      'sections'
    );
    processRemainingBatches(
      id,
      allSections.slice(BATCH_SIZE),
      variables,
      anthropic,
      processedCount,
      includedCount
    );

    // Return immediately with first batch results
    console.log('[Seed API] Returning first batch results:', {
      processedCount,
      includedCount,
      total: allSections.length,
    });
    return NextResponse.json({
      type: 'first_batch_complete',
      processed: processedCount,
      total: allSections.length,
      included: includedCount,
      message: 'First batch complete. Processing continues in background.',
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

async function processRemainingBatches(
  assessmentId: string,
  remainingSections: any[],
  variables: any,
  anthropic: Anthropic,
  initialProcessed: number,
  initialIncluded: number
) {
  const supabase = supabaseAdmin();
  const BATCH_SIZE = 10;
  let processedCount = initialProcessed;
  let includedCount = initialIncluded;

  for (let i = 0; i < remainingSections.length; i += BATCH_SIZE) {
    const batch = remainingSections.slice(i, i + BATCH_SIZE);

    try {
      const prompt = buildBatchPrompt(batch, variables);
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });

      const decisionsText = response.content[0].type === 'text' ? response.content[0].text : '[]';
      const decisions = JSON.parse(decisionsText);

      const applicable = batch.filter((section, idx) => decisions[idx]?.applies === true);

      if (applicable.length > 0) {
        const checkRows = applicable.map(s => ({
          assessment_id: assessmentId,
          code_section_key: s.key,
          code_section_number: s.number,
          code_section_title: s.title,
          check_name: `${s.number} - ${s.title}`,
          status: 'pending',
        }));

        await supabase.from('checks').insert(checkRows);
      }

      const logRows = batch.map((s, idx) => ({
        assessment_id: assessmentId,
        section_key: s.key,
        decision: decisions[idx]?.applies || false,
        decision_source: 'ai',
        decision_confidence: decisions[idx]?.confidence || 'low',
        reasons: [decisions[idx]?.reason || 'No reason provided'],
        details: {},
        building_params_hash: 'ai_hash',
        variables_snapshot: variables,
      }));

      await supabase.from('section_applicability_log').insert(logRows);

      processedCount += batch.length;
      includedCount += applicable.length;

      await supabase
        .from('assessments')
        .update({ sections_processed: processedCount })
        .eq('id', assessmentId);
    } catch (error) {
      console.error('Background batch processing error:', error);
    }
  }

  // Finalize when all batches complete
  await supabase
    .from('assessments')
    .update({
      seeding_status: 'completed',
      total_sections: includedCount,
    })
    .eq('id', assessmentId);

  console.log(
    `Background processing complete for assessment ${assessmentId}: ${includedCount}/${processedCount} sections included`
  );
}

function buildBatchPrompt(sections: any[], variables: any): string {
  // Extract building characteristics
  const occ = variables?.building_characteristics?.occupancy_classification?.value || 'Unknown';
  const size = variables?.building_characteristics?.building_size_sf?.value || 'Unknown';
  const stories = variables?.building_characteristics?.number_of_stories?.value || 'Unknown';
  const workType = variables?.project_scope?.work_type?.value || 'Unknown';
  const hasParking = variables?.building_characteristics?.has_parking?.value;
  const facilityCategory = variables?.facility_type?.category?.value || 'Unknown';

  return `You are a building code compliance expert analyzing which code sections apply to this project.

PROJECT DETAILS:
- Occupancy: ${occ}
- Building Size: ${size} sq ft, ${stories} stories
- Work Type: ${workType}
- Has Parking: ${hasParking ? 'Yes' : 'No'}
- Facility Type: ${facilityCategory}

ANALYZE THESE ${sections.length} SECTIONS:
${sections
  .map(
    (s, i) => `
${i + 1}. Section ${s.number}: ${s.title}
   Text: ${(s.text || (s.paragraphs && Array.isArray(s.paragraphs) ? s.paragraphs.join(' ') : '') || 'N/A').slice(0, 500)}
`
  )
  .join('\n')}

For each section, determine if it applies to this building. Rules:
- EXCLUDE if section is just a header (e.g., "GENERAL", "DEFINITIONS") with no substantive requirements
- EXCLUDE if section is for a specific feature this building clearly doesn't have (e.g., "fishing pier" for an office building, "dispersion of railings on fishing platform")
- INCLUDE if section contains requirements that could apply to this building type
- Be conservative: when uncertain about applicability, INCLUDE it (prefer false positives over false negatives)

Return ONLY a JSON array with ${sections.length} objects (one per section, in order):
[
  {
    "section_number": "11B-xxx",
    "applies": true,
    "confidence": "high",
    "reason": "Brief explanation in one sentence"
  }
]`;
}

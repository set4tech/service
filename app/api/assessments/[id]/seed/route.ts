import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if already has checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', id)
      .limit(1);

    if (existingChecks && existingChecks.length > 0) {
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
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

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

    // 4. Stream response using ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const BATCH_SIZE = 10;
        let processedCount = 0;
        let includedCount = 0;

        for (let i = 0; i < allSections.length; i += BATCH_SIZE) {
          const batch = allSections.slice(i, i + BATCH_SIZE);

          try {
            // AI Analysis
            const prompt = buildBatchPrompt(batch, variables);
            const response = await anthropic.messages.create({
              model: 'claude-opus-4-20250514',
              max_tokens: 2000,
              temperature: 0.1,
              messages: [{ role: 'user', content: prompt }],
            });

            const decisionsText =
              response.content[0].type === 'text' ? response.content[0].text : '[]';
            const decisions = JSON.parse(decisionsText);

            // Filter applicable sections
            const applicable = batch.filter((section, idx) => decisions[idx]?.applies === true);

            // Insert checks for this batch
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
                console.error('Failed to insert checks:', insertError);
              }
            }

            // Log ALL decisions (both included and excluded) to audit table
            const logRows = batch.map((s, idx) => ({
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

            processedCount += batch.length;
            includedCount += applicable.length;

            // Update progress in assessments table
            await supabase
              .from('assessments')
              .update({ sections_processed: processedCount })
              .eq('id', id);

            // Stream batch result to client
            const message =
              JSON.stringify({
                type: 'batch_complete',
                processed: processedCount,
                total: allSections.length,
                included_in_batch: applicable.length,
                total_included: includedCount,
              }) + '\n';

            controller.enqueue(new TextEncoder().encode(message));
          } catch (error) {
            console.error('Batch processing error:', error);
            const errorMsg =
              JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                batch_index: i,
              }) + '\n';
            controller.enqueue(new TextEncoder().encode(errorMsg));
          }
        }

        // Finalize
        await supabase
          .from('assessments')
          .update({
            seeding_status: 'completed',
            total_sections: includedCount,
          })
          .eq('id', id);

        const finalMsg =
          JSON.stringify({
            type: 'complete',
            total_processed: processedCount,
            total_included: includedCount,
            total_excluded: processedCount - includedCount,
          }) + '\n';

        controller.enqueue(new TextEncoder().encode(finalMsg));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
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

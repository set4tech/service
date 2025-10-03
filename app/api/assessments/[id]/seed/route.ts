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
        seeding_status,
        sections_total,
        sections_processed,
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

    const variables = (assessment.projects as any)?.extracted_variables ?? {};
    const selectedCodes: string[] = (assessment.projects as any)?.selected_code_ids ?? [
      'ICC+CBC_Chapter11A_11B+2025+CA',
    ];

    // Map virtual 11A/11B codes to the real combined code and track which chapters to include
    const codeMapping: { [key: string]: string } = {
      'ICC+CBC_Chapter11A+2025+CA': 'ICC+CBC_Chapter11A_11B+2025+CA',
      'ICC+CBC_Chapter11B+2025+CA': 'ICC+CBC_Chapter11A_11B+2025+CA',
    };

    const realCodeIds = Array.from(new Set(selectedCodes.map(id => codeMapping[id] || id)));
    const chapterFilters: Array<{ name: string; test: (num: string) => boolean }> = [];

    // Determine which chapters to include based on selection
    if (selectedCodes.includes('ICC+CBC_Chapter11A+2025+CA')) {
      chapterFilters.push({
        name: '11A',
        test: num => /^11\d+A($|\.)/.test(num),
      });
    }
    if (selectedCodes.includes('ICC+CBC_Chapter11B+2025+CA')) {
      chapterFilters.push({
        name: '11B',
        test: num => num.startsWith('11B-'),
      });
    }
    if (selectedCodes.includes('ICC+CBC_Chapter11A_11B+2025+CA')) {
      chapterFilters.push(
        {
          name: '11A',
          test: num => /^11\d+A($|\.)/.test(num),
        },
        {
          name: '11B',
          test: num => num.startsWith('11B-'),
        }
      );
    }

    // 2. Fetch ALL sections for selected codes (filter by drawing_assessable)
    const { data: allSections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .in('code_id', realCodeIds)
      .eq('drawing_assessable', true)
      .order('number');

    // Get element-mapped sections to exclude from section-by-section checks
    const { data: elementMappings } = await supabase
      .from('element_section_mappings')
      .select('section_key');

    const elementSectionKeys = new Set(elementMappings?.map(m => m.section_key) || []);

    if (sectionsError || !allSections) {
      console.error('[Seed API] Database error:', sectionsError);
      return NextResponse.json(
        { error: 'Database error: ' + sectionsError?.message },
        { status: 500 }
      );
    }

    // Filter sections by chapter if needed, and exclude element-mapped sections and general/scope sections
    const filteredSections =
      chapterFilters.length > 0
        ? allSections.filter(
            s =>
              chapterFilters.some(filter => filter.test(s.number)) &&
              !elementSectionKeys.has(s.key) &&
              !/(general|scope)/i.test(s.title)
          )
        : allSections.filter(
            s => !elementSectionKeys.has(s.key) && !/(general|scope)/i.test(s.title)
          );

    if (filteredSections.length === 0) {
      return NextResponse.json(
        { error: 'No sections found', details: `Selected codes: ${selectedCodes.join(', ')}` },
        { status: 404 }
      );
    }

    // 3. Check if this is the first request (initialize) or a continuation
    const isFirstRequest =
      !assessment.seeding_status || assessment.seeding_status === 'not_started';
    const BATCH_SIZE = 10;

    if (isFirstRequest) {
      // Initialize status and create element templates
      await supabase
        .from('assessments')
        .update({
          seeding_status: 'in_progress',
          sections_total: filteredSections.length,
          sections_processed: 0,
        })
        .eq('id', id);

      // Create element group templates
      try {
        const { data: elementGroups } = await supabase
          .from('element_groups')
          .select('id, name, slug')
          .order('sort_order');

        if (elementGroups && elementGroups.length > 0) {
          for (const group of elementGroups) {
            const { data: groupMappings } = await supabase
              .from('element_section_mappings')
              .select('section_key, sections!inner(number, title)')
              .eq('element_group_id', group.id);

            const allSectionKeys = groupMappings?.map(m => m.section_key) || [];

            // Filter section keys using same logic as section-by-section checks
            let filteredSectionKeys = allSectionKeys;
            if (groupMappings) {
              filteredSectionKeys = groupMappings
                .filter(m => {
                  const section = m.sections as any;
                  const sectionNumber = section?.number;
                  const sectionTitle = section?.title;

                  // Apply chapter filter if needed
                  if (
                    chapterFilters.length > 0 &&
                    !chapterFilters.some(filter => filter.test(sectionNumber))
                  ) {
                    return false;
                  }

                  // Exclude general/scope sections
                  if (/(general|scope)/i.test(sectionTitle)) {
                    return false;
                  }

                  return true;
                })
                .map(m => m.section_key);
            }

            if (filteredSectionKeys.length > 0) {
              await supabase.from('checks').insert({
                assessment_id: id,
                check_type: 'element',
                element_group_id: group.id,
                element_sections: filteredSectionKeys,
                code_section_key: filteredSectionKeys[0],
                code_section_number: group.slug,
                code_section_title: `${group.name} Template`,
                check_name: `${group.name} - Template`,
                check_location: 'TBD',
                instance_number: 0,
                status: 'pending',
              });
            }
          }
        }
      } catch (error) {
        console.error('[Seed API] Element template creation error:', error);
      }
    }

    // 4. Get current progress
    const currentProcessed = assessment.sections_processed || 0;
    const currentBatch = filteredSections.slice(currentProcessed, currentProcessed + BATCH_SIZE);

    if (currentBatch.length === 0) {
      // All done
      await supabase.from('assessments').update({ seeding_status: 'completed' }).eq('id', id);

      return NextResponse.json({
        status: 'completed',
        processed: currentProcessed,
        total: filteredSections.length,
      });
    }

    // 5. Process current batch
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://anthropic.helicone.ai',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
        'Helicone-Property-Tag': 'section-applicability-filtering',
      },
    });

    const prompt = buildBatchPrompt(currentBatch, variables);
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const decisionsText = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const decisions = JSON.parse(decisionsText);

    // Filter applicable sections
    const applicable = currentBatch.filter((section, idx) => decisions[idx]?.applies === true);

    // Insert checks for applicable sections
    if (applicable.length > 0) {
      const checkRows = applicable.map(s => ({
        assessment_id: id,
        code_section_key: s.key,
        code_section_number: s.number,
        code_section_title: s.title,
        check_name: `${s.number} - ${s.title}`,
        status: 'pending',
        parent_check_id: null,
        instance_number: 1,
      }));

      await supabase.from('checks').upsert(checkRows, {
        onConflict: 'assessment_id,code_section_number,parent_check_id,instance_number',
        ignoreDuplicates: true,
      });
    }

    // Log decisions
    const logRows = currentBatch.map((s, idx) => ({
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

    // Update progress
    const newProcessed = currentProcessed + currentBatch.length;
    await supabase.from('assessments').update({ sections_processed: newProcessed }).eq('id', id);

    // Return status
    return NextResponse.json({
      status: 'in_progress',
      processed: newProcessed,
      total: filteredSections.length,
      included: applicable.length,
      batch_size: currentBatch.length,
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

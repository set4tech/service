import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase-server';

const BATCH_SIZE = 20;

// Lazy initialization
let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
}

interface CheckForFiltering {
  id: string;
  code_section_number: string;
  code_section_title: string;
}

interface FilterResult {
  id: string;
  exclude: boolean;
}

/**
 * Call GPT-4o-mini to evaluate which checks should be excluded
 */
async function evaluateCheckBatch(
  checks: CheckForFiltering[],
  projectParams: Record<string, unknown>
): Promise<FilterResult[]> {
  const openai = getOpenAI();

  // Format project parameters for the prompt
  const paramLines = Object.entries(projectParams)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `- ${formattedKey}: ${JSON.stringify(value)}`;
    })
    .join('\n');

  // Format checks for the prompt
  const checkLines = checks
    .map((c, i) => `${i + 1}. [${c.id}] ${c.code_section_number} - ${c.code_section_title}`)
    .join('\n');

  const prompt = `You evaluate building code sections for applicability to a specific project.

PROJECT PARAMETERS:
${paramLines || '(No parameters provided)'}

Evaluate each code section below. Mark "exclude": true if the section should be EXCLUDED because:
- It references building elements NOT present in this project (e.g., parking requirements when the project has no parking)
- It applies to different building/occupancy types than this project
- It requires conditions not met by this project (e.g., elevator sections when there's no elevator)
- It's for work types not applicable (e.g., alteration-only sections for new construction)

Be conservative - if uncertain, do NOT exclude (exclude: false).

CODE SECTIONS TO EVALUATE:
${checkLines}

Respond ONLY with valid JSON array:
[{"id":"<check_id>","exclude":true/false},...]`;

  console.log(`[filter-checks] Evaluating batch of ${checks.length} checks`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0.1, // Low temperature for consistent results
  });

  const raw = response.choices[0]?.message?.content || '[]';

  try {
    // Parse the response - handle both array and object with "results" key
    let parsed = JSON.parse(raw);
    if (parsed.results && Array.isArray(parsed.results)) {
      parsed = parsed.results;
    }
    if (!Array.isArray(parsed)) {
      console.error('[filter-checks] Unexpected response format:', raw);
      // Return all as non-excluded if parsing fails
      return checks.map(c => ({ id: c.id, exclude: false }));
    }
    return parsed as FilterResult[];
  } catch (err) {
    console.error('[filter-checks] Failed to parse response:', raw, err);
    return checks.map(c => ({ id: c.id, exclude: false }));
  }
}

/**
 * Flatten extracted_variables into a simple key-value map
 */
function flattenVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  for (const [category, vars] of Object.entries(variables)) {
    if (category === '_metadata') continue;
    if (typeof vars !== 'object' || vars === null) continue;

    for (const [key, val] of Object.entries(vars)) {
      // Handle { value: x, confidence: y } structure
      if (val && typeof val === 'object' && 'value' in val) {
        flat[key] = (val as { value: unknown }).value;
      } else {
        flat[key] = val;
      }
    }
  }

  return flat;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const supabase = supabaseAdmin();

  console.log(`[filter-checks] Starting filtering for assessment ${assessmentId}`);

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const reset = body.reset === true;

    // Get assessment with project data
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, project_id, projects(id, extracted_variables)')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Projects is an object from the join (not an array due to FK relationship)
    const project = assessment.projects as unknown as {
      id: string;
      extracted_variables: Record<string, unknown>;
    } | null;
    const extractedVariables = project?.extracted_variables;

    if (!extractedVariables || Object.keys(extractedVariables).length === 0) {
      return NextResponse.json(
        { error: 'No project parameters found. Please fill in project parameters first.' },
        { status: 400 }
      );
    }

    // Flatten variables for the prompt
    const flatParams = flattenVariables(extractedVariables);
    console.log('[filter-checks] Project parameters:', flatParams);

    // If reset, clear all is_excluded flags first
    if (reset) {
      console.log('[filter-checks] Resetting existing exclusions');
      await supabase
        .from('checks')
        .update({ is_excluded: false })
        .eq('assessment_id', assessmentId);
    }

    // Get all checks to evaluate (not already excluded, unless reset)
    const { data: checks, error: checksError } = await supabase
      .from('checks')
      .select('id, code_section_number, code_section_title')
      .eq('assessment_id', assessmentId)
      .eq('is_excluded', false)
      .order('code_section_number');

    if (checksError) {
      console.error('[filter-checks] Error fetching checks:', checksError);
      return NextResponse.json({ error: 'Failed to fetch checks' }, { status: 500 });
    }

    const totalChecks = checks?.length || 0;
    console.log(`[filter-checks] Found ${totalChecks} checks to evaluate`);

    if (totalChecks === 0) {
      return NextResponse.json({
        status: 'completed',
        total_checks: 0,
        excluded_count: 0,
        message: 'No checks to filter',
      });
    }

    // Update status to in_progress
    await supabase
      .from('assessments')
      .update({
        filtering_status: 'in_progress',
        filtering_checks_total: totalChecks,
        filtering_checks_processed: 0,
        filtering_excluded_count: 0,
        filtering_started_at: new Date().toISOString(),
        filtering_error: null,
      })
      .eq('id', assessmentId);

    // Process in batches
    let processed = 0;
    let excludedCount = 0;

    for (let i = 0; i < totalChecks; i += BATCH_SIZE) {
      const batch = checks.slice(i, i + BATCH_SIZE) as CheckForFiltering[];

      try {
        const results = await evaluateCheckBatch(batch, flatParams);

        // Update excluded checks
        const toExclude = results.filter(r => r.exclude).map(r => r.id);
        if (toExclude.length > 0) {
          await supabase.from('checks').update({ is_excluded: true }).in('id', toExclude);
          excludedCount += toExclude.length;
        }

        processed += batch.length;

        // Update progress
        await supabase
          .from('assessments')
          .update({
            filtering_checks_processed: processed,
            filtering_excluded_count: excludedCount,
          })
          .eq('id', assessmentId);

        console.log(
          `[filter-checks] Progress: ${processed}/${totalChecks}, excluded: ${excludedCount}`
        );
      } catch (batchError) {
        console.error(`[filter-checks] Batch error at ${i}:`, batchError);
        // Continue with next batch instead of failing entirely
        processed += batch.length;
      }
    }

    // Mark as completed
    await supabase
      .from('assessments')
      .update({
        filtering_status: 'completed',
        filtering_checks_processed: processed,
        filtering_excluded_count: excludedCount,
        filtering_completed_at: new Date().toISOString(),
      })
      .eq('id', assessmentId);

    console.log(`[filter-checks] Completed: ${excludedCount}/${totalChecks} checks excluded`);

    return NextResponse.json({
      status: 'completed',
      total_checks: totalChecks,
      excluded_count: excludedCount,
      message: `Filtering complete: ${excludedCount} checks excluded`,
    });
  } catch (error) {
    console.error('[filter-checks] Error:', error);

    // Update status to failed
    await supabase
      .from('assessments')
      .update({
        filtering_status: 'failed',
        filtering_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', assessmentId);

    return NextResponse.json(
      {
        error: 'Filtering failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

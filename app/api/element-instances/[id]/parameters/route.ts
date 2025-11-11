import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateDoorCompliance } from '@/lib/compliance/doors/validator';

/**
 * GET /api/element-instances/[id]/parameters
 * Fetch the parameters for an element instance
 * @param id - The ID of the element instance
 * @returns The parameters for the element instance
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from('element_instances')
    .select('id, label, element_group_id, parameters, assessment_id')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ parameters: data });
}

/**
 * Update element instance parameters and auto-validate against compliance rules
 * PUT /api/element-instances/[id]/parameters
 * Body: { parameters: Record<string, any> }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { parameters } = await req.json();

  if (!parameters || typeof parameters !== 'object') {
    return NextResponse.json({ error: 'parameters must be an object' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    // Fetch instance with element group info
    const { data: instance, error: fetchError } = await supabase
      .from('element_instances')
      .select('id, label, element_group_id, assessment_id, element_groups(slug, name)')
      .eq('id', id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json({ error: 'Element instance not found' }, { status: 404 });
    }

    // Update parameters
    const { data, error } = await supabase
      .from('element_instances')
      .update({ parameters })
      .eq('id', id)
      .select('id, label, parameters')
      .single();

    if (error) {
      console.error('[PUT /parameters] Update error:', error);
      return NextResponse.json({ error: 'Failed to update parameters' }, { status: 400 });
    }

    // Auto-validate after saving (only for doors currently)
    let validationResults = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elementGroupSlug = (instance.element_groups as any)?.slug;

    if (elementGroupSlug === 'doors') {
      try {
        validationResults = await validateDoorCompliance(parameters, undefined, 'applicable');

        // Persist validation results to checks table
        if (validationResults && validationResults.results) {
          console.log(
            `[PUT /parameters] Persisting ${validationResults.results.length} validation results to checks table`
          );

          for (const result of validationResults.results) {
            // Only update checks with deterministic results (not needs_review)
            if (result.passed !== null && result.status !== 'needs_review') {
              // Find the check for this section
              const { data: check, error: checkError } = await supabase
                .from('checks')
                .select('id')
                .eq('element_instance_id', id)
                .eq('code_section_number', result.section_number)
                .single();

              if (checkError) {
                console.warn(
                  `[PUT /parameters] Could not find check for section ${result.section_number}:`,
                  checkError
                );
                continue;
              }

              if (check) {
                // Update check with validation result
                const { error: updateError } = await supabase
                  .from('checks')
                  .update({
                    manual_status: result.status === 'compliant' ? 'compliant' : 'non_compliant',
                    manual_status_note: result.message,
                    manual_status_at: new Date().toISOString(),
                    manual_status_by: 'rules_engine',
                  })
                  .eq('id', check.id);

                if (updateError) {
                  console.error(
                    `[PUT /parameters] Failed to update check ${check.id}:`,
                    updateError
                  );
                } else {
                  console.log(
                    `[PUT /parameters] ✅ Updated check ${check.id} for ${result.section_number}: ${result.status}`
                  );
                }
              }
            }
          }
        }
      } catch (validationError) {
        console.error('[PUT /parameters] Validation error:', validationError);
        // Don't fail the parameter update if validation fails
        validationResults = {
          error: 'Validation failed',
          message: validationError instanceof Error ? validationError.message : 'Unknown error',
        };
      }
    }

    return NextResponse.json({
      success: true,
      instance_id: data.id,
      label: data.label,
      parameters: data.parameters,
      validation: validationResults, // Include validation results in response
    });
  } catch (error) {
    console.error('[PUT /parameters] Error:', error);
    return NextResponse.json({ error: 'Failed to update parameters' }, { status: 500 });
  }
}

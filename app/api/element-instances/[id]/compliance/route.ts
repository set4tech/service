import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Get compliance status for an element instance
 * GET /api/element-instances/[id]/compliance
 *
 * Returns compliance results based on checks in the database
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  try {
    // Fetch element instance

    const { data: instance, error: instanceError } = await supabase
      .from('element_instances')
      .select('id, label, element_group_id, parameters, created_at, updated_at')
      .eq('id', id)
      .single();

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Element instance not found' }, { status: 404 });
    }

    // Fetch all checks for this instance
    const { data: checks, error: checksError } = await supabase
      .from('checks')
      .select(
        'id, code_section_number, code_section_title, manual_status, manual_status_note, manual_status_at, status'
      )
      .eq('element_instance_id', id)
      .order('code_section_number');

    if (checksError) {
      throw checksError;
    }

    // Calculate summary statistics
    const summary = {
      total_checks: checks?.length || 0,
      compliant: checks?.filter(c => c.manual_status === 'compliant').length || 0,
      non_compliant: checks?.filter(c => c.manual_status === 'non_compliant').length || 0,
      needs_review:
        checks?.filter(
          c => c.manual_status === 'insufficient_information' || c.status === 'pending'
        ).length || 0,
      not_applicable: checks?.filter(c => c.manual_status === 'not_applicable').length || 0,
    };

    // Determine overall status
    const hasParameters = instance.parameters && Object.keys(instance.parameters).length > 0;
    const overallStatus =
      summary.non_compliant > 0
        ? 'non_compliant'
        : summary.needs_review > 0
          ? 'needs_review'
          : summary.compliant > 0
            ? 'compliant'
            : 'pending';

    // Get last validation timestamp from most recent check update
    const lastValidatedAt =
      checks
        ?.map(c => c.manual_status_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;

    return NextResponse.json({
      instance_id: instance.id,
      instance_label: instance.label,
      has_parameters: hasParameters,
      last_validated_at: lastValidatedAt,
      parameters_updated_at: instance.updated_at,
      needs_revalidation: instance.updated_at > (lastValidatedAt || '1970-01-01'),
      overall_status: overallStatus,
      summary,
      checks:
        checks?.map(check => ({
          id: check.id,
          section_number: check.code_section_number,
          section_title: check.code_section_title,
          status: check.manual_status || check.status,
          note: check.manual_status_note,
          checked_at: check.manual_status_at,
        })) || [],
    });
  } catch (error) {
    console.error('[GET /compliance] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch compliance status' }, { status: 500 });
  }
}

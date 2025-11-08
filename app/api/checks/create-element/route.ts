import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a new element instance with all its associated checks
 *
 * Flow:
 * 1. Get element group by slug
 * 2. Create element_instances row (label auto-generated if not provided)
 * 3. Seed all checks via seed_element_checks() SQL function (atomic)
 *
 * POST /api/checks/create-element
 * Body: { assessmentId, elementGroupSlug, instanceLabel? }
 *
 * Returns: { instance: { id, label, element_group_id, ... }, checks_created }
 */
export async function POST(req: NextRequest) {
  try {
    const { assessmentId, elementGroupSlug, instanceLabel } = await req.json();

    if (!assessmentId || !elementGroupSlug) {
      return NextResponse.json(
        { error: 'assessmentId and elementGroupSlug are required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1. Get element group
    const elementGroup = await getElementGroup(supabase, elementGroupSlug);
    if (!elementGroup) {
      return NextResponse.json(
        { error: `Element group "${elementGroupSlug}" not found` },
        { status: 404 }
      );
    }

    // 2. Create element instance (trigger auto-generates label if not provided)
    const instance = await createElementInstance(
      supabase,
      assessmentId,
      elementGroup.id,
      instanceLabel
    );

    // 3. Seed all checks for this element instance (done entirely in SQL)
    const result = await seedElementChecks(
      supabase,
      assessmentId,
      elementGroup.id,
      instance.id,
      instance.label
    );

    console.log(
      `[create-element] Created instance "${instance.label}" with ${result.checks_created} checks`
    );

    return NextResponse.json({
      instance: {
        id: instance.id,
        label: instance.label,
        element_group_id: elementGroup.id,
        element_group_name: elementGroup.name,
        assessment_id: assessmentId,
      },
      checks_created: result.checks_created,
      first_check_id: result.first_check_id, // For selecting/assigning screenshots
    });
  } catch (error: any) {
    console.error('[create-element] Error:', error);

    // Handle specific errors
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: 'An instance with that label already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

async function getElementGroup(supabase: any, slug: string) {
  const { data, error } = await supabase
    .from('element_groups')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (error) throw error;
  return data;
}

async function createElementInstance(
  supabase: any,
  assessmentId: string,
  elementGroupId: string,
  label?: string
) {
  const { data, error } = await supabase
    .from('element_instances')
    .insert({
      assessment_id: assessmentId,
      element_group_id: elementGroupId,
      label: label || null, // Trigger generates if null
    })
    .select('id, label')
    .single();

  if (error) {
    // Handle duplicate (race condition)
    if (error.code === '23505') {
      throw new Error('Instance with that label already exists');
    }
    throw error;
  }

  return data;
}

async function seedElementChecks(
  supabase: any,
  assessmentId: string,
  elementGroupId: string,
  elementInstanceId: string,
  instanceLabel: string
): Promise<{ checks_created: number; sections_processed: number; first_check_id: string }> {
  const { data, error } = await supabase.rpc('seed_element_checks', {
    p_assessment_id: assessmentId,
    p_element_group_id: elementGroupId,
    p_element_instance_id: elementInstanceId,
    p_instance_label: instanceLabel,
  });

  if (error) {
    console.error('[seed_element_checks] Database error:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error('seed_element_checks returned no data');
  }

  // Function returns a single row with counts
  const result = data[0];

  console.log(
    `[seed_element_checks] Created ${result.checks_created} checks from ${result.sections_processed} sections (first_check_id: ${result.first_check_id})`
  );

  return result;
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a new element check instance without requiring a template
 * POST /api/checks/create-element
 * Body: { assessmentId, elementGroupSlug, instanceLabel? }
 */
export async function POST(req: NextRequest) {
  const { assessmentId, elementGroupSlug, instanceLabel } = await req.json();

  console.log('[create-element] Request:', { assessmentId, elementGroupSlug, instanceLabel });

  if (!assessmentId || !elementGroupSlug) {
    console.log('[create-element] ❌ Missing required fields');
    return NextResponse.json(
      { error: 'assessmentId and elementGroupSlug are required' },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  // 1. Get element group info
  const { data: elementGroup, error: egError } = await supabase
    .from('element_groups')
    .select('id, name, slug')
    .eq('slug', elementGroupSlug)
    .single();

  if (egError || !elementGroup) {
    return NextResponse.json(
      { error: `Element group "${elementGroupSlug}" not found` },
      { status: 404 }
    );
  }

  // 2. Get section mappings for this element group (assessment-specific or global)
  const { data: sectionKeysData, error: mappingsError } = await supabase.rpc(
    'get_element_sections',
    {
      p_element_group_id: elementGroup.id,
      p_assessment_id: assessmentId,
    }
  );

  console.log('[create-element] Section mappings:', {
    count: sectionKeysData?.length,
    error: mappingsError?.message,
  });

  if (mappingsError) {
    console.log('[create-element] ❌ Failed to fetch section mappings:', mappingsError);
    return NextResponse.json(
      { error: `Failed to fetch section mappings: ${mappingsError.message}` },
      { status: 500 }
    );
  }

  const sectionIds = (sectionKeysData || []).map((sk: any) => sk.section_id);

  if (sectionIds.length === 0) {
    console.log('[create-element] ❌ No section mappings found for:', elementGroupSlug);
    return NextResponse.json(
      { error: `No section mappings found for element group "${elementGroupSlug}"` },
      { status: 400 }
    );
  }

  // 3. Determine instance label (auto-generate if not provided)
  let label: string;

  if (instanceLabel) {
    label = instanceLabel;
  } else {
    // Auto-generate a unique label by finding the next available number
    const { data: existingLabels } = await supabase
      .from('checks')
      .select('instance_label')
      .eq('assessment_id', assessmentId)
      .eq('element_group_id', elementGroup.id)
      .not('instance_label', 'is', null);

    const existingLabelSet = new Set((existingLabels || []).map((c: any) => c.instance_label));

    // Find the next available number
    let nextNumber = 1;
    while (existingLabelSet.has(`${elementGroup.name} ${nextNumber}`)) {
      nextNumber++;
    }

    label = `${elementGroup.name} ${nextNumber}`;
  }

  console.log('[create-element] Creating section checks with:', {
    assessment_id: assessmentId,
    element_group_id: elementGroup.id,
    instance_label: label,
    section_count: sectionIds.length,
  });

  // 4. Fetch section details
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, number, title')
    .in('id', sectionIds);

  if (sectionsError || !sections || sections.length === 0) {
    return NextResponse.json(
      {
        error: `Failed to fetch section details: ${sectionsError?.message || 'No sections found'}`,
      },
      { status: 500 }
    );
  }

  // 5. Create section checks directly (no parent element check)
  // Retry with " (1)" appended if we hit a duplicate
  let currentLabel = label;
  let createdChecks = null;

  // Keep trying with " (1)" appended until we succeed
  while (!createdChecks) {
    const sectionChecks = sections.map(section => ({
      assessment_id: assessmentId,
      check_name: `${currentLabel} - ${section.title}`,
      section_id: section.id,
      code_section_number: section.number,
      code_section_title: section.title,
      element_group_id: elementGroup.id,
      instance_label: currentLabel,
      status: 'pending',
    }));

    const result = await supabase
      .from('checks')
      .insert(sectionChecks)
      .select('*, element_groups(name)');

    if (result.error && result.error.code === '23505') {
      // Duplicate found, append " (1)" and try again
      console.log(
        `[create-element] ℹ️ Duplicate found for "${currentLabel}", trying "${currentLabel} (1)"...`
      );
      currentLabel = `${currentLabel} (1)`;
    } else if (result.error) {
      // Some other error
      console.error('[create-element] ❌ Error creating section checks:', result.error);
      return NextResponse.json(
        { error: `Failed to create section checks: ${result.error.message || 'Unknown error'}` },
        { status: 500 }
      );
    } else {
      // Success!
      createdChecks = result.data;
      console.log(
        `[create-element] ✅ Created ${createdChecks.length} section checks for "${currentLabel}"`
      );
    }
  }

  // 6. Return first check as representative (for UI compatibility)
  const representativeCheck = createdChecks[0];

  return NextResponse.json({ check: representativeCheck });
}

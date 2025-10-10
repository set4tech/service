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

  // 2. Get section mappings for this element group
  const { data: mappings, error: mappingsError } = await supabase
    .from('element_group_section_mappings')
    .select('section_key')
    .eq('element_group_id', elementGroup.id);

  console.log('[create-element] Section mappings:', {
    count: mappings?.length,
    error: mappingsError?.message,
  });

  if (mappingsError) {
    console.log('[create-element] ❌ Failed to fetch section mappings:', mappingsError);
    return NextResponse.json(
      { error: `Failed to fetch section mappings: ${mappingsError.message}` },
      { status: 500 }
    );
  }

  const sectionKeys = (mappings || []).map(m => m.section_key);

  if (sectionKeys.length === 0) {
    console.log('[create-element] ❌ No section mappings found for:', elementGroupSlug);
    return NextResponse.json(
      { error: `No section mappings found for element group "${elementGroupSlug}"` },
      { status: 400 }
    );
  }

  // 3. Determine instance label (auto-generate if not provided)
  // Count existing instances by finding unique instance_labels for this element group
  const { data: existingLabels } = await supabase
    .from('checks')
    .select('instance_label')
    .eq('assessment_id', assessmentId)
    .eq('element_group_id', elementGroup.id)
    .not('instance_label', 'is', null);

  const uniqueLabels = new Set((existingLabels || []).map((c: any) => c.instance_label));
  const nextNumber = uniqueLabels.size + 1;
  const label = instanceLabel || `${elementGroup.name} ${nextNumber}`;

  console.log('[create-element] Creating section checks with:', {
    assessment_id: assessmentId,
    element_group_id: elementGroup.id,
    instance_label: label,
    section_count: sectionKeys.length,
  });

  // 4. Fetch section details
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('key, number, title')
    .in('key', sectionKeys);

  if (sectionsError || !sections || sections.length === 0) {
    return NextResponse.json(
      {
        error: `Failed to fetch section details: ${sectionsError?.message || 'No sections found'}`,
      },
      { status: 500 }
    );
  }

  // 5. Create section checks directly (no parent element check)
  const sectionChecks = sections.map(section => ({
    assessment_id: assessmentId,
    check_type: 'section',
    check_name: `${label} - ${section.title}`,
    code_section_key: section.key,
    code_section_number: section.number,
    code_section_title: section.title,
    element_group_id: elementGroup.id,
    instance_label: label,
    status: 'pending',
  }));

  const { data: createdChecks, error: insertError } = await supabase
    .from('checks')
    .insert(sectionChecks)
    .select('*, element_groups(name)');

  if (insertError || !createdChecks || createdChecks.length === 0) {
    console.error('[create-element] ❌ Error creating section checks:', insertError);
    return NextResponse.json(
      { error: `Failed to create section checks: ${insertError?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }

  console.log(`[create-element] ✅ Created ${createdChecks.length} section checks for "${label}"`);

  // 6. Return first check as representative (for UI compatibility)
  // Note: element_groups.name is already included via JOIN in select()
  const representativeCheck = createdChecks[0];

  return NextResponse.json({ check: representativeCheck });
}

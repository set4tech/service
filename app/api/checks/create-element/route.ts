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
    sample: sectionKeysData?.[0],
  });

  if (mappingsError) {
    console.log('[create-element] ❌ Failed to fetch section mappings:', mappingsError);
    return NextResponse.json(
      { error: `Failed to fetch section mappings: ${mappingsError.message}` },
      { status: 500 }
    );
  }

  // Handle both old format (section_key) and new format (section_id)
  let sectionKeys: string[] = [];
  let sectionIds: string[] = [];

  if (sectionKeysData && sectionKeysData.length > 0) {
    if (sectionKeysData[0].section_id) {
      // New format: RPC returns section_id (UUID)
      sectionIds = sectionKeysData
        .map((sk: any) => sk.section_id)
        .filter((id: any) => id !== undefined && id !== null);
    } else if (sectionKeysData[0].section_key) {
      // Old format: RPC returns section_key (string), need to convert to section_id
      sectionKeys = sectionKeysData
        .map((sk: any) => sk.section_key)
        .filter((key: any) => key !== undefined && key !== null);
    }
  }

  console.log('[create-element] Extracted data:', {
    sectionKeysCount: sectionKeys.length,
    sectionIdsCount: sectionIds.length,
    usingOldFormat: sectionKeys.length > 0,
  });

  // If we have section_keys, convert them to section_ids
  if (sectionKeys.length > 0) {
    const { data: sectionsFromKeys, error: lookupError } = await supabase
      .from('sections')
      .select('id, key')
      .in('key', sectionKeys);

    if (lookupError || !sectionsFromKeys) {
      console.log('[create-element] ❌ Failed to lookup section IDs:', lookupError);
      return NextResponse.json(
        { error: `Failed to lookup section IDs: ${lookupError?.message}` },
        { status: 500 }
      );
    }

    sectionIds = sectionsFromKeys.map((s: any) => s.id);
    console.log('[create-element] Converted section_keys to section_ids:', {
      count: sectionIds.length,
    });
  }

  if (sectionIds.length === 0) {
    console.log('[create-element] ❌ No valid section IDs found for:', elementGroupSlug);
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
    // Auto-generate label as {ElementGroupName} {max_number + 1}
    // Find the HIGHEST number currently in use for this element group
    const { data: existingInstances } = await supabase
      .from('checks')
      .select('instance_label')
      .eq('assessment_id', assessmentId)
      .eq('element_group_id', elementGroup.id)
      .not('instance_label', 'is', null);

    // Get unique instance labels (since each instance has multiple checks)
    const uniqueLabels = Array.from(
      new Set((existingInstances || []).map((c: any) => c.instance_label))
    );

    // Extract numbers from labels like "Doors 14", "Doors 16 (1)", etc.
    // Parse format: "{Name} {number}" or "{Name} {number} (...)"
    const numbers = uniqueLabels
      .map(label => {
        const match = label.match(/\s+(\d+)(?:\s|$)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    // Find the max number in use, default to 0 if none exist
    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;

    // Create label as "{Name} {max + 1}"
    label = `${elementGroup.name} ${maxNumber + 1}`;
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
    .select('id, key, number, title')
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
  // Retry with incremented base number if we hit a duplicate (race condition)
  let currentLabel = label;
  let createdChecks = null;
  let attemptCount = 0;
  const maxAttempts = 10;

  // Keep trying with incremented numbers until we succeed
  while (!createdChecks && attemptCount < maxAttempts) {
    attemptCount++;

    const sectionChecks = sections.map(section => ({
      assessment_id: assessmentId,
      check_name: `${currentLabel} - ${section.title}`,
      section_id: section.id,
      code_section_key: section.key, // Required FK to sections.key
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
      // Duplicate found (race condition), increment the base number
      // Extract the number from "Door 14" or "Door 14 (1)" -> get 14, increment to 15
      const match = currentLabel.match(/^(.+?)\s+(\d+)(?:\s*\(\d+\))?$/);
      if (match) {
        const baseName = match[1]; // e.g., "Door"
        const currentNum = parseInt(match[2], 10); // e.g., 14
        currentLabel = `${baseName} ${currentNum + 1}`; // e.g., "Door 15"
      } else {
        // Fallback: append (1) if we can't parse
        currentLabel = `${currentLabel} (1)`;
      }
      console.log(
        `[create-element] ℹ️ Duplicate found (race condition), trying "${currentLabel}"...`
      );
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

  if (!createdChecks) {
    console.error('[create-element] ❌ Failed to create checks after max attempts');
    return NextResponse.json(
      { error: 'Failed to create element instance after multiple attempts' },
      { status: 500 }
    );
  }

  // 6. Return first check as representative (for UI compatibility)
  const representativeCheck = createdChecks[0];

  return NextResponse.json({ check: representativeCheck });
}

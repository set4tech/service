import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a new element check instance using optimized RPC function
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

  try {
    // Call the RPC function - all the work happens in the database
    const { data, error } = await supabase.rpc('create_element_instance', {
      p_assessment_id: assessmentId,
      p_element_group_slug: elementGroupSlug,
      p_instance_label: instanceLabel || null,
    });

    if (error) {
      console.error('[create-element] ❌ Error from RPC:', error);
      return NextResponse.json(
        { error: `Failed to create element instance: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      console.error('[create-element] ❌ No data returned from RPC');
      return NextResponse.json(
        { error: 'No sections found for this element group' },
        { status: 400 }
      );
    }

    const result = data[0];
    
    console.log(`[create-element] ✅ Created ${result.sections_created} section checks for "${result.instance_label}"`);

    // Return check in the same format as before for UI compatibility
    return NextResponse.json({
      check: {
        id: result.check_id,
        check_name: result.check_name,
        instance_label: result.instance_label,
        element_groups: {
          name: result.element_group_name,
        },
      },
    });
  } catch (err: any) {
    console.error('[create-element] ❌ Unexpected error:', err);
    return NextResponse.json(
      { error: `Unexpected error: ${err?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

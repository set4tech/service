import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: screenshotId } = await params;
    const { checkIds } = await req.json();

    console.log('[ASSIGN] Starting screenshot assignment:', {
      screenshotId,
      checkIds,
      checkCount: checkIds?.length,
    });

    if (!Array.isArray(checkIds) || checkIds.length === 0) {
      return NextResponse.json({ error: 'checkIds must be a non-empty array' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Use RPC function to assign to all checks in element instances (one query)
    const { data, error } = await supabase.rpc('assign_screenshot_to_element_instances', {
      p_screenshot_id: screenshotId,
      p_check_ids: checkIds,
    });

    if (error) {
      console.error('[ASSIGN] ❌ Error creating assignments:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log('[ASSIGN] ✅ Assigned to', data?.assigned_count, 'checks');

    return NextResponse.json({ assigned: data?.assigned_count || 0 });
  } catch (error) {
    console.error('[ASSIGN] ❌ Failed to assign screenshot:', error);
    return NextResponse.json({ error: 'Failed to assign screenshot' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Update instance_label for all checks in an element instance
 * PUT /api/assessments/[id]/element-instances?element_group_id=...&instance_label=...
 * Body: { newInstanceLabel: string }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { searchParams } = new URL(req.url);
  const elementGroupId = searchParams.get('element_group_id');
  const oldInstanceLabel = searchParams.get('instance_label');
  const { newInstanceLabel } = await req.json();

  console.log('[PUT Instance] Updating instance label:', {
    assessmentId,
    elementGroupId,
    oldInstanceLabel,
    newInstanceLabel,
  });

  if (!elementGroupId || !oldInstanceLabel || !newInstanceLabel) {
    return NextResponse.json(
      { error: 'element_group_id, instance_label, and newInstanceLabel are required' },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  // Check if new label already exists for this element group in this assessment
  const { data: existingChecks } = await supabase
    .from('checks')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('element_group_id', elementGroupId)
    .eq('instance_label', newInstanceLabel)
    .limit(1);

  if (existingChecks && existingChecks.length > 0) {
    return NextResponse.json(
      { error: `Instance label "${newInstanceLabel}" already exists for this element group` },
      { status: 409 }
    );
  }

  // Update all checks for this instance atomically
  const { error, count } = await supabase
    .from('checks')
    .update({ instance_label: newInstanceLabel }, { count: 'exact' })
    .eq('assessment_id', assessmentId)
    .eq('element_group_id', elementGroupId)
    .eq('instance_label', oldInstanceLabel);

  if (error) {
    console.error('[PUT Instance] Error updating checks:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log(
    `[PUT Instance] ✅ Updated ${count} checks from "${oldInstanceLabel}" to "${newInstanceLabel}"`
  );

  return NextResponse.json({
    ok: true,
    updated_count: count,
    old_label: oldInstanceLabel,
    new_label: newInstanceLabel,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const { searchParams } = new URL(req.url);
  const elementGroupId = searchParams.get('element_group_id');
  const instanceLabel = searchParams.get('instance_label');

  const supabase = supabaseAdmin();

  // Single atomic delete of all checks for this instance
  const { error, count } = await supabase
    .from('checks')
    .delete({ count: 'exact' })
    .eq('assessment_id', assessmentId)
    .eq('element_group_id', elementGroupId)
    .eq('instance_label', instanceLabel);

  if (error) {
    console.error('[DELETE Instance] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    deleted_count: count,
    instance_label: instanceLabel,
  });
}

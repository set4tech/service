import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Update label for an element instance
 * PUT /api/assessments/[id]/element-instances/[instanceId]
 * Body: { newInstanceLabel: string }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const { id: assessmentId, instanceId } = await params;
  const { newInstanceLabel } = await req.json();

  console.log('[PUT Instance] Updating instance label:', {
    assessmentId,
    instanceId,
    newInstanceLabel,
  });

  if (!newInstanceLabel) {
    return NextResponse.json({ error: 'newInstanceLabel is required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Update the element_instance label
  const { error } = await supabase
    .from('element_instances')
    .update({ label: newInstanceLabel })
    .eq('id', instanceId)
    .eq('assessment_id', assessmentId);

  if (error) {
    console.error('[PUT Instance] Error updating instance:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Instance label "${newInstanceLabel}" already exists for this element group` },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log(`[PUT Instance] ✅ Updated instance ${instanceId} to "${newInstanceLabel}"`);

  return NextResponse.json({
    ok: true,
    instance_id: instanceId,
    new_label: newInstanceLabel,
  });
}

/**
 * Delete an element instance and all its checks
 * DELETE /api/assessments/[id]/element-instances/[instanceId]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const { id: assessmentId, instanceId } = await params;

  console.log('[DELETE Instance] Deleting instance:', {
    assessmentId,
    instanceId,
  });

  const supabase = supabaseAdmin();

  // Get instance label before deleting for response
  const { data: instance } = await supabase
    .from('element_instances')
    .select('label')
    .eq('id', instanceId)
    .eq('assessment_id', assessmentId)
    .single();

  // Delete the element_instance (CASCADE will delete all checks)
  const { error } = await supabase
    .from('element_instances')
    .delete()
    .eq('id', instanceId)
    .eq('assessment_id', assessmentId);

  if (error) {
    console.error('[DELETE Instance] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log(`[DELETE Instance] ✅ Deleted instance ${instanceId} (${instance?.label})`);

  return NextResponse.json({
    ok: true,
    instance_id: instanceId,
    instance_label: instance?.label,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

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

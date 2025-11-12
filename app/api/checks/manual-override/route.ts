import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { checkIds, manual_status, manual_status_note } = await req.json();

  if (!checkIds || !Array.isArray(checkIds) || checkIds.length === 0) {
    return NextResponse.json({ error: 'checkIds array required' }, { status: 400 });
  }

  if (!manual_status) {
    return NextResponse.json({ error: 'manual_status required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from('checks')
    .update({
      manual_status,
      manual_status_note: manual_status_note || null,
      manual_status_at: new Date().toISOString(),
      manual_status_by: 'user', // TODO: Get from auth
    })
    .in('id', checkIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: checkIds.length });
}

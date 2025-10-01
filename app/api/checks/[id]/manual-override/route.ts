import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ComplianceOverrideStatus } from '@/types/database';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { override, note } = body as { override: ComplianceOverrideStatus | null; note?: string };

    // Validate override value
    const validStatuses: (ComplianceOverrideStatus | null)[] = ['compliant', 'non_compliant', 'not_applicable', null];
    if (!validStatuses.includes(override)) {
      return NextResponse.json(
        { error: 'Invalid override value. Must be "compliant", "non_compliant", "not_applicable", or null' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Prepare update data
    const updateData: any = {
      manual_override: override,
      manual_override_note: note || null,
      manual_override_at: override ? new Date().toISOString() : null,
      // TODO: Add user tracking when auth is implemented
      // manual_override_by: user.id,
    };

    // Update the check
    const { data, error } = await supabase
      .from('checks')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating manual override:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ check: data });
  } catch (error: any) {
    console.error('Manual override API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

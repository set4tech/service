import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ComplianceOverrideStatus } from '@/types/database';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { override, note } = body as { override: ComplianceOverrideStatus | null; note?: string };

    const supabase = supabaseAdmin();

    // Prepare update data
    const updateData: any = {
      manual_status: override,
      manual_status_note: note || null,
      manual_status_at: override ? new Date().toISOString() : null,
      // When setting override, mark as 'completed' so it's not processing anymore
      status: override ? 'completed' : undefined,
    };

    // Update the check
    const { data, error } = await supabase
      .from('checks')
      .update(updateData)
      .eq('id', id)
      .select('*');

    if (error) {
      console.error('Error updating manual override:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if the check was found and updated
    if (!data || data.length === 0) {
      console.warn(`Check ${id} not found - may have been deleted or excluded`);
      return NextResponse.json(
        { error: 'Check not found - it may have been deleted or excluded' },
        { status: 404 }
      );
    }

    return NextResponse.json({ check: data[0] });
  } catch (error: any) {
    console.error('Manual override API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

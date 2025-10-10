import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const { overrides } = await req.json();

  if (!overrides || typeof overrides !== 'object') {
    return NextResponse.json({ error: 'overrides required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    // Prepare override records
    const overrideRecords = Object.entries(overrides).map(([sectionKey, data]: [string, any]) => {
      if (!data.status) {
        throw new Error(`Status required for section ${sectionKey}`);
      }

      return {
        check_id: checkId,
        section_key: sectionKey,
        section_number: sectionKey.split(':').pop() || sectionKey, // Extract section number from key
        override_status: data.status,
        note: data.note || null,
      };
    });

    // Upsert overrides (insert or update if exists)
    const { error } = await supabase.from('section_overrides').upsert(overrideRecords, {
      onConflict: 'check_id,section_key',
    });

    if (error) {
      console.error('Failed to save section overrides:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: overrideRecords.length });
  } catch (error: any) {
    console.error('Section overrides error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to fetch overrides for a check
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('section_overrides')
      .select('*')
      .eq('check_id', checkId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE endpoint to remove a specific section override
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const { searchParams } = new URL(req.url);
  const sectionKey = searchParams.get('sectionKey');

  if (!sectionKey) {
    return NextResponse.json({ error: 'sectionKey required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    const { error } = await supabase
      .from('section_overrides')
      .delete()
      .eq('check_id', checkId)
      .eq('section_key', sectionKey);

    if (error) {
      console.error('Failed to delete section override:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Section override delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

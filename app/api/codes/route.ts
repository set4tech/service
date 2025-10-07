import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { SUPPORTED_CODE_IDS } from '@/lib/codes';

interface CodeNode {
  id: string;
  name: string;
  publisher?: string;
  jurisdiction?: string;
  year?: string;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    // Fetch only the supported codes (11A and 11B virtual codes)
    const { data, error } = await supabase
      .from('codes')
      .select('id, title, provider, version, jurisdiction')
      .in('id', SUPPORTED_CODE_IDS)
      .order('title', { ascending: true });

    if (error) throw error;

    // Map Supabase fields to expected format
    const codes: CodeNode[] = (data || []).map((code) => ({
      id: code.id,
      name: code.title,
      publisher: code.provider,
      jurisdiction: code.jurisdiction,
      year: code.version,
    }));

    return NextResponse.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch codes from database' },
      { status: 500 }
    );
  }
}

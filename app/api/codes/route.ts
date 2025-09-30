import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface CodeNode {
  id: string;
  name: string;
  publisher?: string;
  jurisdiction?: string;
  year?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const jurisdiction = searchParams.get('jurisdiction');
    const provider = searchParams.get('provider');
    const version = searchParams.get('version');

    // Build Supabase query
    const supabase = supabaseAdmin();
    let query = supabase
      .from('codes')
      .select('id, title, provider, version, jurisdiction')
      .order('title', { ascending: true });

    // Apply filters
    if (jurisdiction) query = query.eq('jurisdiction', jurisdiction);
    if (provider) query = query.eq('provider', provider);
    if (version) query = query.eq('version', version);

    const { data, error } = await query;

    if (error) throw error;

    // Filter out the combined CBC_Chapter11A_11B code (now split into separate 11A and 11B)
    const filteredData = (data || []).filter(code => code.id !== 'ICC+CBC_Chapter11A_11B+2025+CA');

    // Map Supabase fields to Neo4j format for backward compatibility
    const codes: CodeNode[] = filteredData.map(code => ({
      id: code.id,
      name: code.title, // title → name
      publisher: code.provider, // provider → publisher
      jurisdiction: code.jurisdiction,
      year: code.version, // version → year
    }));

    return NextResponse.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    return NextResponse.json({ error: 'Failed to fetch codes from database' }, { status: 500 });
  }
}

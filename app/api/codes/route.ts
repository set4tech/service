import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface Chapter {
  id: string;
  name: string;
  number: string;
}

interface CodeNode {
  id: string;
  name: string;
  publisher?: string;
  jurisdiction?: string;
  year?: string;
  chapters: Chapter[];
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from('codes')
      .select('id, year, jurisdiction, title, chapters(id, name, number)')
      .order('title', { ascending: true });

    if (error) throw error;

    // Map Supabase fields to expected format
    const codes: CodeNode[] = (data || []).map((code: any) => ({
      id: code.id,
      name: code.title,
      jurisdiction: code.jurisdiction,
      year: code.year,
      chapters: (code.chapters || []).map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        number: ch.number,
      })),
    }));

    return NextResponse.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    return NextResponse.json({ error: 'Failed to fetch codes from database' }, { status: 500 });
  }
}

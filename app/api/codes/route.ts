import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Natural sort comparator for chapter numbers (handles numeric parts correctly)
function naturalCompare(a: string, b: string): number {
  const regex = /(\d+)|(\D+)/g;
  const aParts = a.match(regex) || [];
  const bParts = b.match(regex) || [];

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '';
    const bPart = bParts[i] || '';

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Both are numbers, compare numerically
      if (aNum !== bNum) return aNum - bNum;
    } else {
      // At least one is not a number, compare as strings
      if (aPart !== bPart) return aPart.localeCompare(bPart);
    }
  }

  return 0;
}

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
      chapters: (code.chapters || [])
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          number: ch.number,
        }))
        .sort((a: Chapter, b: Chapter) => naturalCompare(a.number, b.number)),
    }));

    return NextResponse.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    return NextResponse.json({ error: 'Failed to fetch codes from database' }, { status: 500 });
  }
}

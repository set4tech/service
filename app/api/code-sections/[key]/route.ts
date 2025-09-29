import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/neo4j';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  try {
    // Fetch section with paragraphs and references
    const results = await runQuery<any>(
      `
      MATCH (s:Section {key: $key})
      OPTIONAL MATCH (s)-[:HAS_PARAGRAPH]->(p:Paragraph)
      OPTIONAL MATCH (s)-[:REFERENCES]->(ref:Section)
      OPTIONAL MATCH (ref)-[:HAS_PARAGRAPH]->(refP:Paragraph)
      RETURN
        s,
        collect(DISTINCT p) as paragraphs,
        collect(DISTINCT {
          section: ref,
          paragraphs: collect(DISTINCT refP)
        }) as references
    `,
      { key }
    );

    if (results.length === 0) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const result = results[0];
    const section = result.s?.properties || {};
    const paragraphs = (result.paragraphs || []).map((p: any) => p?.properties || {});
    const references = (result.references || []).map((ref: any) => ({
      section: ref.section?.properties || {},
      paragraphs: (ref.paragraphs || []).map((p: any) => p?.properties || {}),
      fullText: (ref.paragraphs || []).map((p: any) => p?.properties?.text || '').join('\n\n'),
    }));

    return NextResponse.json({
      ...section,
      paragraphs,
      fullText: paragraphs.map((p: any) => p.text || '').join('\n\n'),
      references,
    });
  } catch (error) {
    console.error('Failed to fetch code section:', error);
    return NextResponse.json({ error: 'Failed to fetch code section' }, { status: 500 });
  }
}

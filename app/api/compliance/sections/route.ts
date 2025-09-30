import { NextRequest, NextResponse } from 'next/server';
import { getCodeAssembly, runQuery } from '@/lib/neo4j';

// Cache for section data (in production, use Redis)
const sectionsCache = new Map<string, unknown>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codeId = searchParams.get('codeId');

  if (!codeId) {
    return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
  }

  try {
    // Check cache first
    if (sectionsCache.has(codeId)) {
      // Return cached sections
      return NextResponse.json(sectionsCache.get(codeId));
    }

    // Get code assembly from Neo4j using TypeScript backend
    const assembly = await getCodeAssembly(codeId);

    if (!assembly || !assembly.sections) {
      return NextResponse.json(
        {
          error: 'Code not found',
          details: `No sections found for code ID: ${codeId}`,
        },
        { status: 404 }
      );
    }

    // Format sections for frontend consumption
    const formattedSections = assembly.sections.map((section: any) => ({
      key: section.key || `${section.id}`,
      number: section.number,
      title: section.title,
      type: section.item_type || 'section',
      requirements: section.paragraphs || [],
      text: section.text,
      references: [], // TODO: Add references if needed
      source_id: section.source_id,
      hasContent: !!(section.paragraphs && section.paragraphs.length > 0),
      subsections: section.subsections || [],
    }));

    const result = {
      code_id: codeId,
      code_title: `Code ${codeId}`, // TODO: Get actual code title
      total_sections: formattedSections.length,
      sections: formattedSections,
    };

    // Cache the result
    sectionsCache.set(codeId, result);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch sections',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Get a single section with its full context (including references)
export async function POST(request: NextRequest) {
  const { sectionKey } = await request.json();

  if (!sectionKey) {
    return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
  }

  try {
    // Query Neo4j for the specific section with its references
    const sections = await runQuery<any>(
      `
      MATCH (s:Section {key: $sectionKey})
      OPTIONAL MATCH (s)-[:REFS]->(ref:Section)
      RETURN s, collect(DISTINCT ref) as references
    `,
      { sectionKey }
    );

    if (!sections.length) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const section = sections[0];
    const sectionData = section.s.properties;
    const references = section.references.map((ref: any) => ref.properties);

    // Use paragraphs property directly from Section node
    const paragraphs = sectionData.paragraphs || [];

    return NextResponse.json({
      key: sectionData.key,
      number: sectionData.number,
      title: sectionData.title,
      type: sectionData.item_type || 'section',
      requirements: paragraphs,
      text: sectionData.text,
      references,
      source_id: sectionData.source_id,
      hasContent: !!(paragraphs && paragraphs.length > 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch section',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

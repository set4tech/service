import { NextRequest, NextResponse } from 'next/server';
import { getAssessmentChecks } from '@/lib/queries/get-assessment-checks';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const elementGroup = searchParams.get('element_group'); // e.g., 'doors', 'bathrooms', 'kitchens'
  const mode = searchParams.get('mode') as 'section' | 'element' | null;

  // Require mode parameter
  if (!mode || (mode !== 'section' && mode !== 'element')) {
    return NextResponse.json(
      { error: 'mode parameter required (must be "section" or "element")' },
      { status: 400 }
    );
  }

  try {
    const checks = await getAssessmentChecks(id, { search, elementGroup, mode });
    return NextResponse.json(checks);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch checks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

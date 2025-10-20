import { NextResponse } from 'next/server';

/**
 * DEPRECATED ENDPOINT
 *
 * This endpoint is no longer used in the current application architecture.
 * It relied on /api/compliance/sections which was deleted in commit ea90483
 * when the app migrated from Neo4j to Supabase-based architecture.
 *
 * Current workflow:
 * - POST /api/assessments to create an assessment
 * - POST /api/assessments/[id]/seed to seed checks
 *
 * Related deprecated pages:
 * - /app/compliance/[projectId]/page.tsx (old compliance checker UI)
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated',
      details: 'Use POST /api/assessments and POST /api/assessments/[id]/seed instead',
    },
    { status: 410 } // 410 Gone - indicates the resource is no longer available
  );
}

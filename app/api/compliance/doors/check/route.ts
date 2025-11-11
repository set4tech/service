import { NextRequest, NextResponse } from 'next/server';
import { checkDoorCompliance } from '@/lib/compliance/doors/rules';
import { DoorParameters } from '@/types/compliance';

/**
 * Check door compliance against CBC Section 11B-404
 * POST /api/compliance/doors/check
 *
 * Body: DoorParameters object
 *
 * Returns: { violations: ComplianceViolation[] }
 */
export async function POST(req: NextRequest) {
  try {
    const doorParameters: DoorParameters = await req.json();

    // Validate that we have door parameters
    if (!doorParameters || typeof doorParameters !== 'object') {
      return NextResponse.json(
        { error: 'Invalid door parameters. Expected an object with door properties.' },
        { status: 400 }
      );
    }

    // Check compliance
    const violations = checkDoorCompliance(doorParameters);

    // Calculate compliance summary
    const summary = {
      total_violations: violations.length,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      is_compliant: violations.length === 0,
    };

    return NextResponse.json({
      success: true,
      summary,
      violations,
    });
  } catch (error) {
    console.error('[POST /api/compliance/doors/check] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check door compliance',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

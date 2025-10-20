import { describe, it, expect } from 'vitest';
import { processRpcRowsToViolations } from '@/lib/reports/process-violations';

/**
 * Helper to simulate what get_assessment_report RPC returns
 * The RPC already filters:
 * - is_excluded = false
 * - Only violations (manual_status or compliance_status indicates non-compliance)
 */
function simulateRpcFiltering(checks: any[]) {
  return checks.filter(check => {
    // Filter out excluded checks
    if (check.is_excluded === true) return false;

    // Filter to only violations (what RPC does)
    const effectiveStatus = check.manual_status || check.compliance_status;
    return (
      effectiveStatus === 'non_compliant' ||
      effectiveStatus === 'needs_more_info' ||
      effectiveStatus === 'insufficient_information'
    );
  });
}

describe('Violations Processing Consistency', () => {
  it('should produce identical violations for the same check data', () => {
    // Sample RPC data representing checks with violations (already filtered by RPC)
    const rpcData = [
      {
        check_id: 'check-1', // RPC uses check_id, not id
        check_name: '11B-404 - Doors.',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        code_section_title: 'Doors.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        instance_label: 'Door 1',
        element_group_name: 'Doors',
        compliance_status: 'non_compliant', // From analysis_runs
        ai_reasoning: 'Door width is insufficient',
        confidence: 'high',
        violations: [
          {
            description: 'The plan explicitly dimensions the door leaf width as 34 inches',
            severity: 'major',
          },
        ],
        recommendations: ['Increase door width to 36 inches minimum'],
        effective_status: 'non_compliant', // Calculated by RPC
        screenshots: [
          {
            id: 'screenshot-1',
            screenshot_url: 'https://example.com/screenshot1.jpg',
            thumbnail_url: 'https://example.com/thumb1.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 100,
              y: 200,
              width: 300,
              height: 400,
              zoom_level: 1,
            },
          },
        ],
      },
      {
        check_id: 'check-2',
        check_name: '11B-603.2 - Door swing.',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        code_section_title: 'Door swing.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        instance_label: 'Door 1',
        element_group_name: 'Doors',
        compliance_status: 'non_compliant',
        ai_reasoning: 'Door swings into required clear floor space',
        confidence: 'high',
        violations: [
          {
            description: 'The door swings into the required clear floor space of a fixture',
            severity: 'major',
          },
        ],
        recommendations: ['Reverse door swing direction'],
        effective_status: 'non_compliant',
        screenshots: [
          {
            id: 'screenshot-2',
            screenshot_url: 'https://example.com/screenshot2.jpg',
            thumbnail_url: 'https://example.com/thumb2.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 150,
              y: 250,
              width: 300,
              height: 400,
              zoom_level: 1,
            },
          },
        ],
      },
      // check-3 would be FILTERED OUT by RPC because manual_status='compliant'
      // check-4 INCLUDED because needs_more_info is considered a violation state
      {
        check_id: 'check-4',
        check_name: '11B-304.4 - Door swing',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-304.4',
        code_section_number: '11B-304.4',
        code_section_title: 'Door swing',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        compliance_status: 'needs_more_info',
        ai_reasoning: 'Cannot determine door swing direction from plan',
        confidence: 'low',
        violations: [],
        recommendations: ['Provide detail showing door swing'],
        effective_status: 'needs_more_info',
        screenshots: [],
      },
    ];

    // Process RPC data (no filtering needed - RPC already filtered)
    const violations = processRpcRowsToViolations(rpcData);

    // Should be 3: check-1 (major), check-2 (major), check-4 (needs_more_info)
    // check-3 was already filtered out by RPC (manual_status = 'compliant')
    expect(violations).toHaveLength(3);

    // Verify check-1 violation
    const violation1 = violations.find(v => v.checkId === 'check-1');
    expect(violation1).toBeDefined();
    expect(violation1?.severity).toBe('major');
    expect(violation1?.description).toContain('34 inches');
    expect(violation1?.elementGroupName).toBe('Doors');
    expect(violation1?.instanceLabel).toBe('Door 1');
    expect(violation1?.allScreenshots).toHaveLength(1);

    // Verify check-2 violation
    const violation2 = violations.find(v => v.checkId === 'check-2');
    expect(violation2).toBeDefined();
    expect(violation2?.severity).toBe('major');
    expect(violation2?.description).toContain('swings into');

    // Verify check-3 is NOT included (was filtered by RPC due to manual_status='compliant')
    const violation3 = violations.find(v => v.checkId === 'check-3');
    expect(violation3).toBeUndefined();

    // Verify check-4 violation (needs_more_info, no screenshots)
    const violation4 = violations.find(v => v.checkId === 'check-4');
    expect(violation4).toBeDefined();
    expect(violation4?.severity).toBe('needs_more_info');
    expect(violation4?.allScreenshots).toHaveLength(0);
    expect(violation4?.pageNumber).toBe(1); // Default page
  });

  it('should handle excluded checks correctly', () => {
    // Simulating raw check data BEFORE RPC filtering
    const allChecks = [
      {
        check_id: 'check-excluded',
        check_name: 'Excluded Check',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        code_section_title: 'Doors.',
        manual_status: null,
        is_excluded: true, // Will be filtered out by RPC
        check_type: 'section',
        compliance_status: 'non_compliant',
        effective_status: 'non_compliant',
        screenshots: [
          {
            id: 'screenshot-1',
            screenshot_url: 'https://example.com/screenshot1.jpg',
            thumbnail_url: 'https://example.com/thumb1.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 100,
              y: 200,
              width: 300,
              height: 400,
              zoom_level: 1,
            },
          },
        ],
      },
      {
        check_id: 'check-not-excluded',
        check_name: 'Not Excluded Check',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        code_section_title: 'Door swing.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        compliance_status: 'non_compliant',
        effective_status: 'non_compliant',
        screenshots: [
          {
            id: 'screenshot-2',
            screenshot_url: 'https://example.com/screenshot2.jpg',
            thumbnail_url: 'https://example.com/thumb2.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 100,
              y: 200,
              width: 300,
              height: 400,
              zoom_level: 1,
            },
          },
        ],
      },
    ];

    // Simulate RPC filtering (this is what the database does)
    const rpcData = simulateRpcFiltering(allChecks);
    const violations = processRpcRowsToViolations(rpcData);

    // Should only include second check (first was filtered by RPC)
    expect(violations).toHaveLength(1);
    expect(violations[0].checkId).toBe('check-not-excluded');
  });

  it('should handle manual status with priority', () => {
    // Simulating raw check data BEFORE RPC filtering
    const allChecks = [
      {
        check_id: 'check-manual-non-compliant',
        check_name: 'Manually Non-Compliant',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        manual_status: 'non_compliant', // Manual override
        is_excluded: false,
        compliance_status: 'compliant', // Overridden by manual_status
        effective_status: 'non_compliant', // RPC calculates: coalesce(manual_status, compliance_status)
        screenshots: [
          {
            id: 'screenshot-1',
            screenshot_url: 'https://example.com/screenshot1.jpg',
            thumbnail_url: 'https://example.com/thumb1.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 100,
              y: 200,
              width: 300,
              height: 400,
            },
          },
        ],
      },
      {
        check_id: 'check-manual-compliant',
        check_name: 'Manually Compliant',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        manual_status: 'compliant', // Manual override
        is_excluded: false,
        compliance_status: 'non_compliant', // Overridden by manual_status
        effective_status: 'compliant', // RPC calculates: coalesce(manual_status, compliance_status)
        screenshots: [
          {
            id: 'screenshot-2',
            screenshot_url: 'https://example.com/screenshot2.jpg',
            thumbnail_url: 'https://example.com/thumb2.jpg',
            page_number: 1,
            crop_coordinates: {
              x: 100,
              y: 200,
              width: 300,
              height: 400,
            },
          },
        ],
      },
    ];

    // Simulate RPC filtering (filters based on effective_status)
    const rpcData = simulateRpcFiltering(allChecks);
    const violations = processRpcRowsToViolations(rpcData);

    // Should only include first check (second was filtered by RPC due to manual_status='compliant')
    expect(violations).toHaveLength(1);
    expect(violations[0].checkId).toBe('check-manual-non-compliant');
  });
});

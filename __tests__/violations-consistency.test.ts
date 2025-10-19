import { describe, it, expect } from 'vitest';
import { processChecksToViolations, CheckWithAnalysis } from '@/lib/reports/process-violations';

describe('Violations Processing Consistency', () => {
  it('should produce identical violations for the same check data', () => {
    // Sample check data representing an element check with violations
    const sampleChecks: CheckWithAnalysis[] = [
      {
        id: 'check-1',
        check_name: '11B-404 - Doors.',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        code_section_title: 'Doors.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        element_group_id: 'element-group-doors',
        instance_label: 'Door 1',
        element_group_name: 'Doors',
        latest_status: 'non_compliant',
        latest_analysis_runs: {
          compliance_status: 'non_compliant',
          ai_reasoning: 'Door width is insufficient',
          confidence: 'high',
          violations: [
            {
              description: 'The plan explicitly dimensions the door leaf width as 34 inches',
              severity: 'major',
            },
          ],
          recommendations: ['Increase door width to 36 inches minimum'],
        },
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
        id: 'check-2',
        check_name: '11B-603.2 - Door swing.',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        code_section_title: 'Door swing.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        element_group_id: 'element-group-doors',
        instance_label: 'Door 1',
        element_group_name: 'Doors',
        latest_status: 'non_compliant',
        latest_analysis_runs: {
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
        },
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
      {
        id: 'check-3',
        check_name: '11B-213.3.5 - Mirrors.',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-213.3.5',
        code_section_number: '11B-213.3.5',
        code_section_title: 'Mirrors.',
        manual_status: 'compliant',
        is_excluded: false,
        check_type: 'section',
        latest_status: 'non_compliant',
        latest_analysis_runs: {
          compliance_status: 'non_compliant',
          ai_reasoning: 'Mirror height seems insufficient',
          confidence: 'medium',
          violations: [
            {
              description: 'Mirror may not extend to proper height',
              severity: 'moderate',
            },
          ],
          recommendations: [],
        },
        screenshots: [
          {
            id: 'screenshot-3',
            screenshot_url: 'https://example.com/screenshot3.jpg',
            thumbnail_url: 'https://example.com/thumb3.jpg',
            page_number: 2,
            crop_coordinates: {
              x: 200,
              y: 300,
              width: 300,
              height: 400,
              zoom_level: 1,
            },
          },
        ],
      },
      {
        id: 'check-4',
        check_name: '11B-304.4 - Door swing',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-304.4',
        code_section_number: '11B-304.4',
        code_section_title: 'Door swing',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        latest_status: 'needs_more_info',
        latest_analysis_runs: {
          compliance_status: 'needs_more_info',
          ai_reasoning: 'Cannot determine door swing direction from plan',
          confidence: 'low',
          violations: [],
          recommendations: ['Provide detail showing door swing'],
        },
        screenshots: [],
      },
    ];

    // Process checks using shared logic
    const violations = processChecksToViolations(sampleChecks);

    // Verify correct number of violations
    // Should be 3: check-1 (major), check-2 (major), check-4 (needs_more_info)
    // check-3 should be excluded (manual_override = 'compliant')
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

    // Verify check-3 is NOT included (manual status to compliant)
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
    const checksWithExclusions: CheckWithAnalysis[] = [
      {
        id: 'check-excluded',
        check_name: 'Excluded Check',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        code_section_title: 'Doors.',
        manual_status: null,
        is_excluded: true, // Excluded from assessment
        check_type: 'section',
        latest_status: 'non_compliant', // Should be ignored due to exclusion
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
        id: 'check-not-excluded',
        check_name: 'Not Excluded Check',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        code_section_title: 'Door swing.',
        manual_status: null,
        is_excluded: false,
        check_type: 'section',
        latest_status: 'non_compliant',
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

    const violations = processChecksToViolations(checksWithExclusions);

    // Should only include second check (first is excluded)
    expect(violations).toHaveLength(1);
    expect(violations[0].checkId).toBe('check-not-excluded');
  });

  it('should handle manual status with priority', () => {
    const checksWithManualStatus: CheckWithAnalysis[] = [
      {
        id: 'check-manual-non-compliant',
        check_name: 'Manually Non-Compliant',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
        code_section_number: '11B-404',
        manual_status: 'non_compliant',
        is_excluded: false,
        latest_status: 'compliant', // Should be ignored
        latest_analysis_runs: {
          compliance_status: 'compliant', // Should be ignored
        },
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
        id: 'check-manual-compliant',
        check_name: 'Manually Compliant',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-603.2',
        code_section_number: '11B-603.2',
        manual_status: 'compliant',
        is_excluded: false,
        latest_status: 'non_compliant', // Should be ignored
        latest_analysis_runs: {
          compliance_status: 'non_compliant', // Should be ignored
        },
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

    const violations = processChecksToViolations(checksWithManualStatus);

    // Should only include first check (manual status to non_compliant)
    expect(violations).toHaveLength(1);
    expect(violations[0].checkId).toBe('check-manual-non-compliant');
  });
});

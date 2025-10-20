import { describe, it, expect } from 'vitest';
import { processRpcRowsToViolations } from '@/lib/reports/process-violations';

describe('processRpcRowsToViolations', () => {
  describe('Severity Detection', () => {
    it('should use severity from violations array when available', () => {
      const rpcData = [
        {
          check_id: 'check-1',
          check_name: 'Door Width',
          code_section_key: 'ICC:CBC:11B-404',
          code_section_number: '11B-404',
          code_section_title: 'Doors',
          effective_status: 'non_compliant',
          ai_reasoning: 'Door is too narrow',
          violations: [
            {
              description: 'Door width is 30 inches, requires 32 inches minimum',
              severity: 'major',
            },
          ],
          recommendations: ['Widen door to 32 inches'],
          screenshots: [
            {
              id: 'screenshot-1',
              screenshot_url: 'https://example.com/s1.jpg',
              thumbnail_url: 'https://example.com/t1.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('major');
      expect(violations[0].description).toContain('30 inches');
    });

    it('should handle moderate severity', () => {
      const rpcData = [
        {
          check_id: 'check-2',
          check_name: 'Mirror Height',
          code_section_number: '11B-213',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Mirror may not extend to proper height',
              severity: 'moderate',
            },
          ],
          screenshots: [
            {
              id: 'screenshot-2',
              screenshot_url: 'https://example.com/s2.jpg',
              thumbnail_url: 'https://example.com/t2.jpg',
              page_number: 2,
              crop_coordinates: { x: 50, y: 50, width: 150, height: 150 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].severity).toBe('moderate');
    });

    it('should handle minor severity', () => {
      const rpcData = [
        {
          check_id: 'check-3',
          check_name: 'Signage',
          code_section_number: '11B-703',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Sign contrast may be insufficient',
              severity: 'minor',
            },
          ],
          screenshots: [
            {
              id: 'screenshot-3',
              screenshot_url: 'https://example.com/s3.jpg',
              thumbnail_url: 'https://example.com/t3.jpg',
              page_number: 3,
              crop_coordinates: { x: 200, y: 200, width: 100, height: 100 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].severity).toBe('minor');
    });

    it('should default to moderate when severity is missing', () => {
      const rpcData = [
        {
          check_id: 'check-4',
          check_name: 'Some Check',
          code_section_number: '11B-123',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Non-compliant condition',
              // severity missing
            },
          ],
          screenshots: [
            {
              id: 'screenshot-4',
              screenshot_url: 'https://example.com/s4.jpg',
              thumbnail_url: 'https://example.com/t4.jpg',
              page_number: 1,
              crop_coordinates: { x: 0, y: 0, width: 100, height: 100 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].severity).toBe('moderate');
    });

    it('should use needs_more_info severity when effective_status indicates it', () => {
      const rpcData = [
        {
          check_id: 'check-5',
          check_name: 'Door Swing',
          code_section_number: '11B-304',
          effective_status: 'needs_more_info',
          ai_reasoning: 'Cannot determine door swing from plan',
          violations: [],
          screenshots: [
            {
              id: 'screenshot-5',
              screenshot_url: 'https://example.com/s5.jpg',
              thumbnail_url: 'https://example.com/t5.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].severity).toBe('needs_more_info');
      expect(violations[0].description).toContain('Additional information needed');
    });

    it('should handle insufficient_information status', () => {
      const rpcData = [
        {
          check_id: 'check-6',
          check_name: 'Parking Space',
          code_section_number: '11B-502',
          effective_status: 'insufficient_information',
          violations: [],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].severity).toBe('needs_more_info');
    });
  });

  describe('Screenshot Handling', () => {
    it('should handle check with no screenshots', () => {
      const rpcData = [
        {
          check_id: 'check-no-screenshot',
          check_name: 'Check Without Screenshot',
          code_section_number: '11B-999',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Violation without screenshot',
              severity: 'moderate',
            },
          ],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations).toHaveLength(1);
      expect(violations[0].screenshotId).toBe('no-screenshot');
      expect(violations[0].screenshotUrl).toBe('');
      expect(violations[0].allScreenshots).toHaveLength(0);
      expect(violations[0].pageNumber).toBe(1);
    });

    it('should handle multiple screenshots and use first one as primary', () => {
      const rpcData = [
        {
          check_id: 'check-multi-screenshot',
          check_name: 'Multi Screenshot Check',
          code_section_number: '11B-111',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Has multiple screenshots',
              severity: 'major',
            },
          ],
          screenshots: [
            {
              id: 'screenshot-page-3',
              screenshot_url: 'https://example.com/page3.jpg',
              thumbnail_url: 'https://example.com/thumb3.jpg',
              page_number: 3,
              crop_coordinates: { x: 300, y: 300, width: 200, height: 200 },
            },
            {
              id: 'screenshot-page-1',
              screenshot_url: 'https://example.com/page1.jpg',
              thumbnail_url: 'https://example.com/thumb1.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200 },
            },
            {
              id: 'screenshot-page-2',
              screenshot_url: 'https://example.com/page2.jpg',
              thumbnail_url: 'https://example.com/thumb2.jpg',
              page_number: 2,
              crop_coordinates: { x: 200, y: 200, width: 200, height: 200 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations).toHaveLength(1);
      // Should use first screenshot (sorted by page_number)
      expect(violations[0].pageNumber).toBe(1);
      expect(violations[0].screenshotId).toBe('screenshot-page-1');
      expect(violations[0].allScreenshots).toHaveLength(3);
      // Verify all screenshots are sorted by page number
      expect(violations[0].allScreenshots[0].pageNumber).toBe(1);
      expect(violations[0].allScreenshots[1].pageNumber).toBe(2);
      expect(violations[0].allScreenshots[2].pageNumber).toBe(3);
    });

    it('should handle screenshot with undefined id', () => {
      const rpcData = [
        {
          check_id: 'check-undefined-screenshot-id',
          check_name: 'Undefined Screenshot ID',
          code_section_number: '11B-222',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Screenshot without ID',
              severity: 'moderate',
            },
          ],
          screenshots: [
            {
              id: undefined,
              screenshot_url: 'https://example.com/noId.jpg',
              thumbnail_url: 'https://example.com/noIdThumb.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations).toHaveLength(1);
      // Should use fallback ID
      expect(violations[0].screenshotId).toBe('check-undefined-screenshot-id-primary');
    });
  });

  describe('Check ID Handling', () => {
    it('should handle check with check_id field (RPC format)', () => {
      const rpcData = [
        {
          check_id: 'rpc-check-id',
          check_name: 'RPC Format',
          code_section_number: '11B-333',
          effective_status: 'non_compliant',
          violations: [{ description: 'Test', severity: 'moderate' }],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].checkId).toBe('rpc-check-id');
    });

    it('should fallback to id field when check_id is missing (API format)', () => {
      const rpcData = [
        {
          id: 'api-check-id',
          check_name: 'API Format',
          code_section_number: '11B-444',
          effective_status: 'non_compliant',
          violations: [{ description: 'Test', severity: 'moderate' }],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].checkId).toBe('api-check-id');
    });
  });

  describe('Metadata Fields', () => {
    it('should include element group information', () => {
      const rpcData = [
        {
          check_id: 'element-check',
          check_name: 'Door Check',
          code_section_number: '11B-404',
          effective_status: 'non_compliant',
          check_type: 'element',
          element_group_name: 'Doors',
          instance_label: 'Door 1',
          human_readable_title: 'Main entrance door width insufficient',
          violations: [{ description: 'Too narrow', severity: 'major' }],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].checkType).toBe('element');
      expect(violations[0].elementGroupName).toBe('Doors');
      expect(violations[0].instanceLabel).toBe('Door 1');
      expect(violations[0].humanReadableTitle).toBe('Main entrance door width insufficient');
    });

    it('should include source URLs and labels', () => {
      const rpcData = [
        {
          check_id: 'source-check',
          check_name: 'Check with Source',
          code_section_number: '11B-555',
          section_number: '11B-555',
          effective_status: 'non_compliant',
          source_url: 'https://codes.iccsafe.org/content/CBC2025/chapter-11b',
          violations: [{ description: 'Violation', severity: 'moderate' }],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].sourceUrl).toBe('https://codes.iccsafe.org/content/CBC2025/chapter-11b');
      expect(violations[0].sourceLabel).toBe('CBC 11B-555');
    });

    it('should include parent source URL as fallback', () => {
      const rpcData = [
        {
          check_id: 'parent-source-check',
          check_name: 'Check with Parent Source',
          code_section_number: '11B-666',
          effective_status: 'non_compliant',
          parent_source_url: 'https://codes.iccsafe.org/content/CBC2025/parent',
          violations: [{ description: 'Violation', severity: 'moderate' }],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].sourceUrl).toBe('https://codes.iccsafe.org/content/CBC2025/parent');
    });

    it('should include reasoning and recommendations', () => {
      const rpcData = [
        {
          check_id: 'detailed-check',
          check_name: 'Detailed Check',
          code_section_number: '11B-777',
          effective_status: 'non_compliant',
          ai_reasoning: 'The door width measurement shows 30 inches',
          confidence: 'high',
          violations: [{ description: 'Width too small', severity: 'major' }],
          recommendations: [
            'Increase width to 32 inches',
            'Consider 36 inches for better accessibility',
          ],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].reasoning).toBe('The door width measurement shows 30 inches');
      expect(violations[0].confidence).toBe('high');
      expect(violations[0].recommendations).toHaveLength(2);
      expect(violations[0].recommendations).toContain('Increase width to 32 inches');
    });

    it('should deduplicate recommendations', () => {
      const rpcData = [
        {
          check_id: 'dup-recommendations',
          check_name: 'Duplicate Recommendations',
          code_section_number: '11B-888',
          effective_status: 'non_compliant',
          violations: [{ description: 'Issue', severity: 'moderate' }],
          recommendations: ['Fix it', 'Fix it', 'Another fix', 'Fix it'],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].recommendations).toHaveLength(2);
      expect(violations[0].recommendations).toContain('Fix it');
      expect(violations[0].recommendations).toContain('Another fix');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty RPC data', () => {
      const violations = processRpcRowsToViolations([]);
      expect(violations).toHaveLength(0);
    });

    it('should handle check with no violations array', () => {
      const rpcData = [
        {
          check_id: 'no-violations-array',
          check_name: 'No Violations Array',
          code_section_number: '11B-999',
          effective_status: 'non_compliant',
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('moderate');
    });

    it('should handle screenshot without crop_coordinates', () => {
      const rpcData = [
        {
          check_id: 'no-crop-coords',
          check_name: 'No Crop Coordinates',
          code_section_number: '11B-1000',
          effective_status: 'non_compliant',
          violations: [{ description: 'Issue', severity: 'moderate' }],
          screenshots: [
            {
              id: 'screenshot-no-coords',
              screenshot_url: 'https://example.com/noCoords.jpg',
              thumbnail_url: 'https://example.com/noCoordsThumb.jpg',
              page_number: 1,
              // crop_coordinates missing
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      // Should not create violation when crop_coordinates missing
      expect(violations).toHaveLength(1);
      expect(violations[0].screenshotId).toBe('no-screenshot');
    });

    it('should handle zoom_level in crop coordinates', () => {
      const rpcData = [
        {
          check_id: 'zoom-check',
          check_name: 'Zoom Level Check',
          code_section_number: '11B-1001',
          effective_status: 'non_compliant',
          violations: [{ description: 'Issue', severity: 'moderate' }],
          screenshots: [
            {
              id: 'zoomed-screenshot',
              screenshot_url: 'https://example.com/zoomed.jpg',
              thumbnail_url: 'https://example.com/zoomedThumb.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200, zoom_level: 1.5 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].bounds.zoom_level).toBe(1.5);
      expect(violations[0].allScreenshots[0].bounds.zoom_level).toBe(1.5);
    });

    it('should default zoom_level to 1 when missing', () => {
      const rpcData = [
        {
          check_id: 'no-zoom-check',
          check_name: 'No Zoom Level',
          code_section_number: '11B-1002',
          effective_status: 'non_compliant',
          violations: [{ description: 'Issue', severity: 'moderate' }],
          screenshots: [
            {
              id: 'no-zoom-screenshot',
              screenshot_url: 'https://example.com/noZoom.jpg',
              thumbnail_url: 'https://example.com/noZoomThumb.jpg',
              page_number: 1,
              crop_coordinates: { x: 100, y: 100, width: 200, height: 200 },
            },
          ],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].bounds.zoom_level).toBe(1);
    });
  });

  describe('Description Generation', () => {
    it('should use violation description when available', () => {
      const rpcData = [
        {
          check_id: 'custom-desc',
          check_name: 'Custom Description',
          code_section_number: '11B-1003',
          effective_status: 'non_compliant',
          violations: [
            {
              description: 'Custom violation description from AI',
              severity: 'major',
            },
          ],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].description).toBe('Custom violation description from AI');
    });

    it('should generate description for needs_more_info when violation description missing', () => {
      const rpcData = [
        {
          check_id: 'needs-info-desc',
          check_name: 'Needs Info Description',
          code_section_number: '11B-1004',
          effective_status: 'needs_more_info',
          violations: [],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].description).toBe('Additional information needed for 11B-1004');
    });

    it('should generate default non-compliant description when violation description missing', () => {
      const rpcData = [
        {
          check_id: 'default-desc',
          check_name: 'Default Description',
          code_section_number: '11B-1005',
          effective_status: 'non_compliant',
          violations: [],
          screenshots: [],
        },
      ];

      const violations = processRpcRowsToViolations(rpcData);

      expect(violations[0].description).toBe('Non-compliant with 11B-1005');
    });
  });
});

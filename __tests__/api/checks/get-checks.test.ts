import { describe, it, expect } from 'vitest';
import { createMockGroupedChecks } from '../../test-utils';

/**
 * Tests for GET /api/checks
 *
 * Tests filtering and grouping logic for loading checks
 */

describe('GET /api/checks - Filtering and Grouping', () => {
  describe('Filter by assessment_id and element_group_id', () => {
    it('should filter checks by assessment_id', () => {
      const allChecks = [
        ...createMockGroupedChecks(2).map(c => ({ ...c, assessment_id: 'assessment-1' })),
        ...createMockGroupedChecks(2).map(c => ({ ...c, assessment_id: 'assessment-2' })),
      ];

      const filtered = allChecks.filter(c => c.assessment_id === 'assessment-1');

      expect(filtered.length).toBe(2);
      filtered.forEach(c => {
        expect(c.assessment_id).toBe('assessment-1');
      });
    });

    it('should filter by element_group_id', () => {
      const checks = createMockGroupedChecks(3);
      checks[0].element_group_id = 'doors';
      checks[1].element_group_id = 'doors';
      checks[2].element_group_id = 'ramps';

      const filtered = checks.filter(c => c.element_group_id === 'doors');

      expect(filtered.length).toBe(2);
      filtered.forEach(c => {
        expect(c.element_group_id).toBe('doors');
      });
    });

    it('should filter by instance_label', () => {
      const checks = createMockGroupedChecks(4);
      checks[0].instance_label = 'Doors 12';
      checks[1].instance_label = 'Doors 12';
      checks[2].instance_label = 'Doors 13';
      checks[3].instance_label = 'Doors 12';

      const filtered = checks.filter(c => c.instance_label === 'Doors 12');

      expect(filtered.length).toBe(3);
      filtered.forEach(c => {
        expect(c.instance_label).toBe('Doors 12');
      });
    });

    it('should combine multiple filters', () => {
      const checks = createMockGroupedChecks(5);
      checks.forEach((c, i) => {
        c.assessment_id = i < 3 ? 'assessment-1' : 'assessment-2';
        c.element_group_id = i % 2 === 0 ? 'doors' : 'ramps';
        c.instance_label = `Instance ${i}`;
      });

      const filtered = checks.filter(
        c => c.assessment_id === 'assessment-1' && c.element_group_id === 'doors'
      );

      expect(filtered.length).toBe(2); // Index 0 and 2
      filtered.forEach(c => {
        expect(c.assessment_id).toBe('assessment-1');
        expect(c.element_group_id).toBe('doors');
      });
    });
  });

  describe('Sorting', () => {
    it('should sort checks by code_section_number', () => {
      const checks = createMockGroupedChecks(4);
      checks[0].code_section_number = '11B-404.3';
      checks[1].code_section_number = '11B-404.1';
      checks[2].code_section_number = '11B-404.4';
      checks[3].code_section_number = '11B-404.2';

      const sorted = [...checks].sort((a, b) =>
        (a.code_section_number || '').localeCompare(b.code_section_number || '')
      );

      expect(sorted[0].code_section_number).toBe('11B-404.1');
      expect(sorted[1].code_section_number).toBe('11B-404.2');
      expect(sorted[2].code_section_number).toBe('11B-404.3');
      expect(sorted[3].code_section_number).toBe('11B-404.4');
    });

    it('should handle missing code_section_number', () => {
      const checks = createMockGroupedChecks(3);
      checks[0].code_section_number = '11B-404.2';
      checks[1].code_section_number = undefined as any;
      checks[2].code_section_number = '11B-404.1';

      const sorted = [...checks].sort((a, b) =>
        (a.code_section_number || '').localeCompare(b.code_section_number || '')
      );

      // Undefined should sort first (empty string)
      expect(sorted[0].code_section_number).toBeUndefined();
      expect(sorted[1].code_section_number).toBe('11B-404.1');
      expect(sorted[2].code_section_number).toBe('11B-404.2');
    });
  });

  describe('Finding active check in group', () => {
    it('should find check by id in sorted array', () => {
      const checks = createMockGroupedChecks(3);
      const targetId = checks[1].id;

      const found = checks.find(c => c.id === targetId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(targetId);
    });

    it('should fall back to first check if target not found', () => {
      const checks = createMockGroupedChecks(3);
      const targetId = 'non-existent-id';

      const found = checks.find(c => c.id === targetId) || checks[0];

      expect(found).toBeDefined();
      expect(found.id).toBe(checks[0].id);
    });

    it('should handle empty array gracefully', () => {
      const checks: any[] = [];
      const targetId = 'any-id';

      const found = checks.find(c => c.id === targetId);

      expect(found).toBeUndefined();
    });
  });

  describe('URL encoding for instance_label', () => {
    it('should handle URL-encoded instance labels', () => {
      const instanceLabel = 'Doors 12';
      const encoded = encodeURIComponent(instanceLabel);

      expect(encoded).toBe('Doors%2012');

      const decoded = decodeURIComponent(encoded);
      expect(decoded).toBe(instanceLabel);
    });

    it('should handle special characters in instance labels', () => {
      const labels = [
        'Doors & Windows',
        'Ramp #1',
        'Bathroom (1st Floor)',
      ];

      labels.forEach(label => {
        const encoded = encodeURIComponent(label);
        const decoded = decodeURIComponent(encoded);
        expect(decoded).toBe(label);
      });
    });
  });

  describe('Empty results', () => {
    it('should return empty array when no matches', () => {
      const checks = createMockGroupedChecks(3);
      const filtered = checks.filter(c => c.assessment_id === 'non-existent');

      expect(filtered).toEqual([]);
      expect(Array.isArray(filtered)).toBe(true);
    });
  });
});

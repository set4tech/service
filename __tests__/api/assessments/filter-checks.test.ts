import { describe, it, expect } from 'vitest';

/**
 * Tests for the filter-checks endpoint logic
 * These tests verify the core business logic without requiring Next.js runtime
 */

// Mock data factories
const createMockCheck = (id: string, sectionNumber: string, title: string) => ({
  id,
  code_section_number: sectionNumber,
  code_section_title: title,
});

const createMockProjectVariables = () => ({
  building_characteristics: {
    building_size_sf: { value: 2500, confidence: 'high' },
    number_of_stories: { value: 1, confidence: 'high' },
    has_parking: { value: false, confidence: 'high' },
    has_elevator: { value: false, confidence: 'medium' },
    occupancy_classification: { value: 'B - Business', confidence: 'high' },
  },
  project_scope: {
    work_type: { value: 'New Construction', confidence: 'high' },
  },
  _metadata: {
    entry_method: 'manual',
    entry_date: '2024-01-01',
  },
});

// Helper function copied from route.ts for testing
function flattenVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  for (const [category, vars] of Object.entries(variables)) {
    if (category === '_metadata') continue;
    if (typeof vars !== 'object' || vars === null) continue;

    for (const [key, val] of Object.entries(vars as Record<string, unknown>)) {
      if (val && typeof val === 'object' && 'value' in val) {
        flat[key] = (val as { value: unknown }).value;
      } else {
        flat[key] = val;
      }
    }
  }

  return flat;
}

// Helper to parse LLM response (mirrors route.ts logic)
function parseFilterResults(
  raw: string,
  checks: Array<{ id: string }>
): Array<{ id: string; exclude: boolean }> {
  try {
    let parsed = JSON.parse(raw);
    if (parsed.results && Array.isArray(parsed.results)) {
      parsed = parsed.results;
    }
    if (!Array.isArray(parsed)) {
      return checks.map(c => ({ id: c.id, exclude: false }));
    }
    return parsed;
  } catch {
    return checks.map(c => ({ id: c.id, exclude: false }));
  }
}

describe('Filter Checks Endpoint Logic', () => {
  describe('flattenVariables', () => {
    it('should flatten nested variables with value/confidence structure', () => {
      const variables = createMockProjectVariables();
      const flat = flattenVariables(variables);

      expect(flat.building_size_sf).toBe(2500);
      expect(flat.number_of_stories).toBe(1);
      expect(flat.has_parking).toBe(false);
      expect(flat.occupancy_classification).toBe('B - Business');
    });

    it('should skip _metadata category', () => {
      const variables = createMockProjectVariables();
      const flat = flattenVariables(variables);

      expect(flat.entry_method).toBeUndefined();
      expect(flat.entry_date).toBeUndefined();
    });

    it('should handle raw values without value/confidence wrapper', () => {
      const variables = {
        simple: {
          direct_value: 'test',
          number_value: 42,
        },
      };
      const flat = flattenVariables(variables);

      expect(flat.direct_value).toBe('test');
      expect(flat.number_value).toBe(42);
    });

    it('should handle empty variables', () => {
      const flat = flattenVariables({});
      expect(Object.keys(flat)).toHaveLength(0);
    });

    it('should handle null/undefined categories', () => {
      const variables = {
        valid: { key: { value: 'test', confidence: 'high' } },
        nullCat: null,
      };
      const flat = flattenVariables(variables as Record<string, unknown>);

      expect(flat.key).toBe('test');
      expect(Object.keys(flat)).toHaveLength(1);
    });
  });

  describe('parseFilterResults', () => {
    it('should parse valid array response', () => {
      const raw = '[{"id":"check-1","exclude":true},{"id":"check-2","exclude":false}]';
      const checks = [{ id: 'check-1' }, { id: 'check-2' }];

      const results = parseFilterResults(raw, checks);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'check-1', exclude: true });
      expect(results[1]).toEqual({ id: 'check-2', exclude: false });
    });

    it('should parse response with results wrapper', () => {
      const raw = '{"results":[{"id":"check-1","exclude":true}]}';
      const checks = [{ id: 'check-1' }];

      const results = parseFilterResults(raw, checks);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ id: 'check-1', exclude: true });
    });

    it('should return all non-excluded on invalid JSON', () => {
      const raw = 'invalid json';
      const checks = [{ id: 'check-1' }, { id: 'check-2' }];

      const results = parseFilterResults(raw, checks);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.exclude === false)).toBe(true);
    });

    it('should return all non-excluded on non-array response', () => {
      const raw = '{"message": "error"}';
      const checks = [{ id: 'check-1' }, { id: 'check-2' }];

      const results = parseFilterResults(raw, checks);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.exclude === false)).toBe(true);
    });
  });

  describe('batch processing', () => {
    const BATCH_SIZE = 20;

    it('should split checks into correct batch sizes', () => {
      const checks = Array.from({ length: 55 }, (_, i) =>
        createMockCheck(`check-${i}`, `11B-${400 + i}`, `Section ${400 + i}`)
      );

      const batches: Array<typeof checks> = [];
      for (let i = 0; i < checks.length; i += BATCH_SIZE) {
        batches.push(checks.slice(i, i + BATCH_SIZE));
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(20);
      expect(batches[1]).toHaveLength(20);
      expect(batches[2]).toHaveLength(15);
    });

    it('should handle checks less than batch size', () => {
      const checks = Array.from({ length: 5 }, (_, i) =>
        createMockCheck(`check-${i}`, `11B-${400 + i}`, `Section ${400 + i}`)
      );

      const batches: Array<typeof checks> = [];
      for (let i = 0; i < checks.length; i += BATCH_SIZE) {
        batches.push(checks.slice(i, i + BATCH_SIZE));
      }

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(5);
    });

    it('should handle empty checks array', () => {
      const checks: Array<ReturnType<typeof createMockCheck>> = [];

      const batches: Array<typeof checks> = [];
      for (let i = 0; i < checks.length; i += BATCH_SIZE) {
        batches.push(checks.slice(i, i + BATCH_SIZE));
      }

      expect(batches).toHaveLength(0);
    });
  });

  describe('exclusion logic', () => {
    it('should identify checks to exclude from results', () => {
      const results = [
        { id: 'check-1', exclude: true },
        { id: 'check-2', exclude: false },
        { id: 'check-3', exclude: true },
        { id: 'check-4', exclude: false },
      ];

      const toExclude = results.filter(r => r.exclude).map(r => r.id);

      expect(toExclude).toEqual(['check-1', 'check-3']);
    });

    it('should handle all checks excluded', () => {
      const results = [
        { id: 'check-1', exclude: true },
        { id: 'check-2', exclude: true },
      ];

      const toExclude = results.filter(r => r.exclude).map(r => r.id);

      expect(toExclude).toHaveLength(2);
    });

    it('should handle no checks excluded', () => {
      const results = [
        { id: 'check-1', exclude: false },
        { id: 'check-2', exclude: false },
      ];

      const toExclude = results.filter(r => r.exclude).map(r => r.id);

      expect(toExclude).toHaveLength(0);
    });
  });

  describe('progress tracking', () => {
    it('should calculate progress correctly', () => {
      const total = 100;
      const processed = 45;
      const excluded = 12;

      const progress = {
        processed,
        total,
        excluded,
        percentage: Math.round((processed / total) * 100),
      };

      expect(progress.percentage).toBe(45);
    });

    it('should handle zero total checks', () => {
      const total = 0;
      const processed = 0;

      const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

      expect(percentage).toBe(0);
    });
  });

  describe('prompt formatting', () => {
    it('should format project parameters for prompt', () => {
      const params = {
        building_size_sf: 2500,
        has_parking: false,
        occupancy_classification: 'B - Business',
      };

      const paramLines = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([key, value]) => {
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `- ${formattedKey}: ${JSON.stringify(value)}`;
        })
        .join('\n');

      expect(paramLines).toContain('Building Size Sf: 2500');
      expect(paramLines).toContain('Has Parking: false');
      expect(paramLines).toContain('Occupancy Classification: "B - Business"');
    });

    it('should format checks for prompt', () => {
      const checks = [
        createMockCheck('uuid-1', '11B-208.1', 'Parking Spaces'),
        createMockCheck('uuid-2', '11B-404.2.6', 'Door Hardware'),
      ];

      const checkLines = checks
        .map((c, i) => `${i + 1}. [${c.id}] ${c.code_section_number} - ${c.code_section_title}`)
        .join('\n');

      expect(checkLines).toBe(
        '1. [uuid-1] 11B-208.1 - Parking Spaces\n2. [uuid-2] 11B-404.2.6 - Door Hardware'
      );
    });
  });
});

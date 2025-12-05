/**
 * Tests for ProjectPanel AI suggestion extraction from pipeline output.
 */
import { describe, it, expect } from 'vitest';

// Test the field mapping logic extracted from ProjectPanel
// These mappings transform agent's project_info fields to form fields

interface FieldMapping {
  category: string;
  variable: string;
  transform?: (value: unknown) => unknown;
}

const FIELD_MAPPING: Record<string, FieldMapping> = {
  address: { category: 'project_identity', variable: 'full_address' },
  building_area: {
    category: 'building_characteristics',
    variable: 'building_size_sf',
    transform: v => (typeof v === 'string' ? parseInt(v.replace(/,/g, ''), 10) || null : v),
  },
  num_stories: {
    category: 'building_characteristics',
    variable: 'number_of_stories',
    transform: v => (typeof v === 'string' ? parseInt(v, 10) || null : v),
  },
  occupancy_classification: {
    category: 'building_characteristics',
    variable: 'occupancy_classification',
    transform: v => {
      if (typeof v !== 'string') return v;
      const letter = v.charAt(0).toUpperCase();
      const occupancyMap: Record<string, string> = {
        A: 'A - Assembly',
        B: 'B - Business',
        E: 'E - Educational',
        F: 'F - Factory',
        H: 'H - High Hazard',
        I: 'I - Institutional',
        M: 'M - Mercantile',
        R: 'R - Residential',
        S: 'S - Storage',
        U: 'U - Utility',
      };
      return occupancyMap[letter] || v;
    },
  },
};

// Helper to extract suggestions from pipeline output (mirrors ProjectPanel logic)
function extractSuggestions(pipelineOutput: {
  metadata?: { project_info?: Record<string, unknown> };
}) {
  const projectInfo = pipelineOutput?.metadata?.project_info;
  if (!projectInfo) return [];

  const suggestions: Array<{
    category: string;
    variable: string;
    value: unknown;
    rawValue: unknown;
  }> = [];

  for (const [agentField, rawValue] of Object.entries(projectInfo)) {
    if (rawValue === null || rawValue === undefined || agentField === 'confidence') continue;

    const mapping = FIELD_MAPPING[agentField];
    if (!mapping) continue;

    const value = mapping.transform ? mapping.transform(rawValue) : rawValue;
    if (value === null || value === undefined) continue;

    suggestions.push({
      category: mapping.category,
      variable: mapping.variable,
      value,
      rawValue,
    });
  }

  return suggestions;
}

describe('ProjectPanel Suggestion Extraction', () => {
  describe('Field Mapping', () => {
    it('should map address to full_address', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            address: '123 Main St, San Francisco, CA 94102',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'project_identity',
        variable: 'full_address',
        value: '123 Main St, San Francisco, CA 94102',
        rawValue: '123 Main St, San Francisco, CA 94102',
      });
    });

    it('should map building_area to building_size_sf', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            building_area: 5000,
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'building_characteristics',
        variable: 'building_size_sf',
        value: 5000,
        rawValue: 5000,
      });
    });

    it('should transform building_area string with commas to number', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            building_area: '10,500',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(10500);
    });

    it('should map num_stories to number_of_stories', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            num_stories: 3,
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'building_characteristics',
        variable: 'number_of_stories',
        value: 3,
        rawValue: 3,
      });
    });

    it('should transform num_stories string to number', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            num_stories: '2',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(2);
    });
  });

  describe('Occupancy Classification Transformation', () => {
    it('should transform "B" to "B - Business"', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            occupancy_classification: 'B',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('B - Business');
      expect(result[0].rawValue).toBe('B');
    });

    it('should transform "R-2" to "R - Residential"', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            occupancy_classification: 'R-2',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('R - Residential');
    });

    it('should transform "A-2" to "A - Assembly"', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            occupancy_classification: 'A-2',
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('A - Assembly');
    });

    it('should handle all occupancy types', () => {
      const occupancies = ['A', 'B', 'E', 'F', 'H', 'I', 'M', 'R', 'S', 'U'];
      const expectedNames = [
        'A - Assembly',
        'B - Business',
        'E - Educational',
        'F - Factory',
        'H - High Hazard',
        'I - Institutional',
        'M - Mercantile',
        'R - Residential',
        'S - Storage',
        'U - Utility',
      ];

      occupancies.forEach((occ, i) => {
        const result = extractSuggestions({
          metadata: { project_info: { occupancy_classification: occ } },
        });
        expect(result[0].value).toBe(expectedNames[i]);
      });
    });
  });

  describe('Multiple Fields', () => {
    it('should extract multiple suggestions from complete project info', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            project_name: 'Test Building', // Not mapped, should be ignored
            address: '456 Oak Ave, Oakland, CA',
            building_area: 12000,
            num_stories: 4,
            occupancy_classification: 'B',
            construction_type: 'Type V-B', // Not mapped, should be ignored
            confidence: 'high', // Should be ignored
          },
        },
      });

      expect(result).toHaveLength(4);

      const addressSuggestion = result.find(s => s.variable === 'full_address');
      expect(addressSuggestion?.value).toBe('456 Oak Ave, Oakland, CA');

      const sizeSuggestion = result.find(s => s.variable === 'building_size_sf');
      expect(sizeSuggestion?.value).toBe(12000);

      const storiesSuggestion = result.find(s => s.variable === 'number_of_stories');
      expect(storiesSuggestion?.value).toBe(4);

      const occupancySuggestion = result.find(s => s.variable === 'occupancy_classification');
      expect(occupancySuggestion?.value).toBe('B - Business');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for null pipeline output', () => {
      const result = extractSuggestions({ metadata: undefined });
      expect(result).toEqual([]);
    });

    it('should return empty array for empty project info', () => {
      const result = extractSuggestions({ metadata: { project_info: {} } });
      expect(result).toEqual([]);
    });

    it('should skip null values', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            address: null,
            building_area: 5000,
          },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].variable).toBe('building_size_sf');
    });

    it('should skip unmapped fields', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            project_name: 'Test Project', // Not in FIELD_MAPPING
            architect_name: 'Test Architect', // Not in FIELD_MAPPING
            sprinklers: true, // Not in FIELD_MAPPING
          },
        },
      });

      expect(result).toEqual([]);
    });

    it('should handle invalid building_area string gracefully', () => {
      const result = extractSuggestions({
        metadata: {
          project_info: {
            building_area: 'not a number',
          },
        },
      });

      // parseInt returns NaN which becomes null via || null
      expect(result).toEqual([]);
    });
  });
});

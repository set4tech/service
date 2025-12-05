/**
 * Tests for ProjectPanel AI suggestion extraction from pipeline output.
 *
 * Field names in project_info now match field names in variable_checklist.json directly.
 * No mapping or transformation is needed.
 */
import { describe, it, expect } from 'vitest';

// Mock variable checklist matching public/variable_checklist.json structure
const VARIABLE_CHECKLIST = {
  project_identity: {
    project_name: { description: 'Full project name/title', type: 'text' },
    project_number: { description: 'Project/job number', type: 'text' },
    address: { description: 'Project address', type: 'text' },
    client_name: { description: 'Owner/client name', type: 'text' },
    architect_name: { description: 'Architecture firm name', type: 'text' },
  },
  project_scope: {
    work_type: { description: 'Type of work being performed', type: 'text' },
    project_description: { description: 'Brief description of the project scope', type: 'text' },
    drawing_date: { description: 'Date on the drawings', type: 'text' },
  },
  building_characteristics: {
    building_area: { description: 'Total building area in sq ft', type: 'number' },
    num_stories: { description: 'Number of stories', type: 'number' },
    construction_type: { description: 'Building construction type', type: 'text' },
    occupancy_classification: { description: 'IBC occupancy group', type: 'text' },
    sprinklers: { description: 'Is the building fully sprinklered?', type: 'boolean' },
  },
};

interface Suggestion {
  category: string;
  variable: string;
  value: unknown;
}

// Helper to extract suggestions from pipeline output (mirrors simplified ProjectPanel logic)
// Note: project_info is at top level of pipelineOutput, not inside metadata
function extractSuggestions(
  pipelineOutput: { project_info?: Record<string, unknown> },
  checklist: typeof VARIABLE_CHECKLIST
): Suggestion[] {
  const projectInfo = pipelineOutput?.project_info;
  if (!projectInfo) return [];

  const suggestions: Suggestion[] = [];

  for (const [field, value] of Object.entries(projectInfo)) {
    // Skip metadata fields
    if (field === 'confidence' || field === 'source_pages' || field === 'is_cover_sheet') continue;
    if (value === null || value === undefined) continue;

    // Find the category that contains this field
    for (const [category, fields] of Object.entries(checklist)) {
      if (field in fields) {
        suggestions.push({ category, variable: field, value });
        break;
      }
    }
  }

  return suggestions;
}

describe('ProjectPanel Suggestion Extraction', () => {
  describe('Direct Field Matching', () => {
    it('should match address field directly', () => {
      const result = extractSuggestions(
        {
          project_info: {
            address: '123 Main St, San Francisco, CA 94102',
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'project_identity',
        variable: 'address',
        value: '123 Main St, San Francisco, CA 94102',
      });
    });

    it('should match building_area field directly', () => {
      const result = extractSuggestions(
        {
          project_info: {
            building_area: 5000,
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'building_characteristics',
        variable: 'building_area',
        value: 5000,
      });
    });

    it('should match num_stories field directly', () => {
      const result = extractSuggestions(
        {
          project_info: {
            num_stories: 3,
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'building_characteristics',
        variable: 'num_stories',
        value: 3,
      });
    });

    it('should match occupancy_classification directly without transformation', () => {
      const result = extractSuggestions(
        {
          project_info: {
            occupancy_classification: 'B',
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'building_characteristics',
        variable: 'occupancy_classification',
        value: 'B', // No transformation - value passed through as-is
      });
    });

    it('should match work_type directly without transformation', () => {
      const result = extractSuggestions(
        {
          project_info: {
            work_type: 'Tenant Improvement',
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        category: 'project_scope',
        variable: 'work_type',
        value: 'Tenant Improvement', // No transformation
      });
    });
  });

  describe('Multiple Fields', () => {
    it('should extract multiple suggestions from complete project info', () => {
      const result = extractSuggestions(
        {
          project_info: {
            project_name: 'Test Building',
            address: '456 Oak Ave, Oakland, CA',
            building_area: 12000,
            num_stories: 4,
            occupancy_classification: 'B',
            construction_type: 'Type V-B',
            confidence: 'high', // Should be ignored
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(6);

      const addressSuggestion = result.find(s => s.variable === 'address');
      expect(addressSuggestion?.value).toBe('456 Oak Ave, Oakland, CA');

      const areaSuggestion = result.find(s => s.variable === 'building_area');
      expect(areaSuggestion?.value).toBe(12000);

      const storiesSuggestion = result.find(s => s.variable === 'num_stories');
      expect(storiesSuggestion?.value).toBe(4);

      const occupancySuggestion = result.find(s => s.variable === 'occupancy_classification');
      expect(occupancySuggestion?.value).toBe('B');

      const constructionSuggestion = result.find(s => s.variable === 'construction_type');
      expect(constructionSuggestion?.value).toBe('Type V-B');

      const projectNameSuggestion = result.find(s => s.variable === 'project_name');
      expect(projectNameSuggestion?.value).toBe('Test Building');
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for null pipeline output', () => {
      const result = extractSuggestions({}, VARIABLE_CHECKLIST);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty project info', () => {
      const result = extractSuggestions({ project_info: {} }, VARIABLE_CHECKLIST);
      expect(result).toEqual([]);
    });

    it('should skip null values', () => {
      const result = extractSuggestions(
        {
          project_info: {
            address: null,
            building_area: 5000,
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0].variable).toBe('building_area');
    });

    it('should skip metadata fields like confidence and source_pages', () => {
      const result = extractSuggestions(
        {
          project_info: {
            confidence: 'high',
            source_pages: ['page_001.png'],
            is_cover_sheet: true,
            building_area: 5000,
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toHaveLength(1);
      expect(result[0].variable).toBe('building_area');
    });

    it('should skip fields not in checklist', () => {
      const result = extractSuggestions(
        {
          project_info: {
            unknown_field: 'some value',
            revision: 'A', // Not in our mock checklist
          },
        },
        VARIABLE_CHECKLIST
      );

      expect(result).toEqual([]);
    });
  });
});

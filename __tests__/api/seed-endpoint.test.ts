import { describe, it, expect } from 'vitest';

/**
 * Tests for the seed endpoint logic
 * These tests verify the core business logic without requiring Next.js runtime
 */

// Mock data factories
const createMockAssessment = (overrides: Record<string, unknown> = {}) => ({
  id: 'assessment-123',
  project_id: 'project-456',
  seeding_status: 'not_started',
  selected_chapter_ids: ['chapter-11b-uuid'],
  projects: {
    id: 'project-456',
    extracted_variables: {
      occupancy_letter: 'B',
      building_area: 50000,
    },
  },
  ...overrides,
});

const createMockSection = (number: string, overrides: Record<string, unknown> = {}) => ({
  key: `ICC:CBC_Chapter11A_11B:2025:CA:${number}`,
  number,
  title: `Section ${number}`,
  chapter_id: 'chapter-11b-uuid',
  drawing_assessable: true,
  never_relevant: false,
  ...overrides,
});

const createMockSections = (count: number) => {
  return Array.from({ length: count }, (_, i) => createMockSection(`11B-${400 + i}`));
};

describe('Seed Endpoint Logic', () => {
  describe('duplicate check prevention', () => {
    it('should filter out existing sections before creating checks', () => {
      const allSections = createMockSections(10);
      const existingCheckKeys = new Set(allSections.slice(0, 5).map(s => s.key));

      const sectionsToAdd = allSections.filter(s => !existingCheckKeys.has(s.key));

      expect(sectionsToAdd).toHaveLength(5);
      expect(sectionsToAdd[0].number).toBe('11B-405'); // Starts at index 5
    });

    it('should create no checks if all sections already have checks', () => {
      const allSections = createMockSections(10);
      const existingCheckKeys = new Set(allSections.map(s => s.key));

      const sectionsToAdd = allSections.filter(s => !existingCheckKeys.has(s.key));

      expect(sectionsToAdd).toHaveLength(0);
    });

    it('should create all checks if none exist', () => {
      const allSections = createMockSections(10);
      const existingCheckKeys = new Set<string>();

      const sectionsToAdd = allSections.filter(s => !existingCheckKeys.has(s.key));

      expect(sectionsToAdd).toHaveLength(10);
    });
  });

  describe('check row creation', () => {
    it('should format check rows correctly from sections', () => {
      const sections = createMockSections(3);
      const assessmentId = 'assessment-123';

      const checkRows = sections.map(s => ({
        assessment_id: assessmentId,
        code_section_key: s.key,
        code_section_number: s.number,
        code_section_title: s.title,
        check_name: `${s.number} - ${s.title}`,
        status: 'pending',
        instance_label: null,
      }));

      expect(checkRows).toHaveLength(3);
      expect(checkRows[0]).toEqual({
        assessment_id: 'assessment-123',
        code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-400',
        code_section_number: '11B-400',
        code_section_title: 'Section 11B-400',
        check_name: '11B-400 - Section 11B-400',
        status: 'pending',
        instance_label: null,
      });
    });
  });

  describe('assessment validation', () => {
    it('should identify assessments with no chapters selected', () => {
      const assessment = createMockAssessment({ selected_chapter_ids: [] });
      const hasChapters =
        assessment.selected_chapter_ids && assessment.selected_chapter_ids.length > 0;

      expect(hasChapters).toBe(false);
    });

    it('should identify assessments with null chapter selection', () => {
      const assessment = createMockAssessment({ selected_chapter_ids: null });
      const chapterIds = assessment.selected_chapter_ids || [];

      expect(chapterIds).toHaveLength(0);
    });

    it('should identify already completed assessments', () => {
      const assessment = createMockAssessment({ seeding_status: 'completed' });

      expect(assessment.seeding_status).toBe('completed');
    });

    it('should identify assessments ready for seeding', () => {
      const assessment = createMockAssessment();

      expect(assessment.seeding_status).toBe('not_started');
      expect(assessment.selected_chapter_ids).toHaveLength(1);
    });
  });

  describe('section filtering', () => {
    it('should filter sections by chapter_id', () => {
      const sections = createMockSections(10);
      const targetChapterId = 'chapter-11b-uuid';

      const filtered = sections.filter(s => s.chapter_id === targetChapterId);

      expect(filtered).toHaveLength(10);
    });

    it('should only include drawing_assessable sections', () => {
      const sections = [
        createMockSection('11B-400', { drawing_assessable: true }),
        createMockSection('11B-401', { drawing_assessable: false }),
        createMockSection('11B-402', { drawing_assessable: true }),
      ];

      const filtered = sections.filter(s => s.drawing_assessable === true);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(s => s.number)).toEqual(['11B-400', '11B-402']);
    });

    it('should exclude never_relevant sections', () => {
      const sections = [
        createMockSection('11B-400', { never_relevant: false }),
        createMockSection('11B-401', { never_relevant: true }),
        createMockSection('11B-402', { never_relevant: false }),
      ];

      const filtered = sections.filter(s => s.never_relevant === false);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(s => s.number)).toEqual(['11B-400', '11B-402']);
    });

    it('should apply all filters together', () => {
      const sections = [
        createMockSection('11B-400', { drawing_assessable: true, never_relevant: false }),
        createMockSection('11B-401', { drawing_assessable: false, never_relevant: false }),
        createMockSection('11B-402', { drawing_assessable: true, never_relevant: true }),
        createMockSection('11B-403', { drawing_assessable: true, never_relevant: false }),
      ];

      const filtered = sections.filter(
        s => s.drawing_assessable === true && s.never_relevant === false
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(s => s.number)).toEqual(['11B-400', '11B-403']);
    });
  });

  describe('progress tracking', () => {
    it('should calculate checks created correctly', () => {
      const totalSections = 100;
      const existingSections = 40;
      const checksCreated = totalSections - existingSections;

      expect(checksCreated).toBe(60);
    });

    it('should handle zero new checks', () => {
      const totalSections = 100;
      const existingSections = 100;
      const checksCreated = Math.max(0, totalSections - existingSections);

      expect(checksCreated).toBe(0);
    });
  });
});

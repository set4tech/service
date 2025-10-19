import { CODE_MAPPING, CODE_IDS, CHAPTER_FILTERS } from './constants';

/**
 * Resolves a virtual code ID (11A or 11B) to the actual database code ID
 * and determines the chapter prefix for filtering sections.
 *
 * @param virtualCodeId - The code ID from the API request
 * @returns Object with the real database code ID and optional chapter prefix
 */
export function resolveCodeId(virtualCodeId: string): {
  realCodeId: string;
  chapterPrefix?: string;
} {
  const realCodeId = CODE_MAPPING[virtualCodeId] || virtualCodeId;

  let chapterPrefix: string | undefined;
  if (virtualCodeId === CODE_IDS.CBC_11A) {
    chapterPrefix = '11A-';
  } else if (virtualCodeId === CODE_IDS.CBC_11B) {
    chapterPrefix = '11B-';
  }

  return { realCodeId, chapterPrefix };
}

/**
 * Generates chapter filter functions for the given code IDs.
 * Used during assessment seeding to filter sections by chapter.
 *
 * @param selectedCodeIds - Array of code IDs selected for the assessment
 * @returns Array of filter objects with name and test function
 */
export function getChapterFilters(selectedCodeIds: string[]): Array<{
  name: string;
  test: (num: string) => boolean;
}> {
  const filters: Array<{ name: string; test: (num: string) => boolean }> = [];
  const seenChapters = new Set<string>();

  for (const codeId of selectedCodeIds) {
    if (codeId === CODE_IDS.CBC_11A && !seenChapters.has('11A')) {
      filters.push({ name: '11A', test: CHAPTER_FILTERS['11A'] });
      seenChapters.add('11A');
    }
    if (codeId === CODE_IDS.CBC_11B && !seenChapters.has('11B')) {
      filters.push({ name: '11B', test: CHAPTER_FILTERS['11B'] });
      seenChapters.add('11B');
    }
  }

  return filters;
}

/**
 * Maps selected code IDs to their real database counterparts.
 * Removes duplicates (e.g., if both 11A and 11B map to the same combined code).
 *
 * @param selectedCodeIds - Array of code IDs from the project
 * @returns Array of unique real code IDs to query from the database
 */
export function getRealCodeIds(selectedCodeIds: string[]): string[] {
  return Array.from(new Set(selectedCodeIds.map(id => CODE_MAPPING[id] || id)));
}

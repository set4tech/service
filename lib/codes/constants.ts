/**
 * Building code identifiers and configuration
 *
 * This module centralizes all code-related constants to avoid duplication
 * across the codebase and make changes easier to maintain.
 */

// Code IDs for different building codes
export const CODE_IDS = {
  CBC_11A: 'ICC+CBC_Chapter11A+2025+CA',
  CBC_11B: 'ICC+CBC_Chapter11B+2025+CA',
  NYCBC_11B: 'ICC+NYCBC_Chapter11+2025+NY',
} as const;

/**
 * Mapping from virtual code IDs (11A, 11B) to the actual combined code in the database.
 * The database stores a single combined code, but the API exposes them separately.
 */
export const CODE_MAPPING: Record<string, string> = {
  [CODE_IDS.CBC_11A]: CODE_IDS.CBC_11A,
  [CODE_IDS.CBC_11B]: CODE_IDS.CBC_11B,
  [CODE_IDS.NYCBC_11B]: CODE_IDS.NYCBC_11B,
};

/**
 * Chapter filter functions for identifying which chapter a section belongs to
 */
export const CHAPTER_FILTERS = {
  '11A': (num: string) => /^11\d+A($|\.)/.test(num),
  '11B': (num: string) => num.startsWith('11B-'),
} as const;

/**
 * Section IDs that should be excluded from assessment checks.
 * These sections don't contain assessable requirements - they only provide
 * context, definitions, or scoping information.
 */
export const EXCLUDED_SECTION_IDS = {
  // Definition sections - only define terms, nothing to check
  DEFINITIONS: [2080, 12],

  // Application/scope sections - determine if code applies, not what to check
  APPLICATION: [2051, 20],
  SCOPE: [2052, 640, 21, 254, 299, 363, 400, 487, 532, 618],

  // Reference sections - point to other sections, no direct requirements
  WHERE_REQUIRED: [2054],
  USE_BASED: [22, 232],

  // General/scoping sections that only contain references to other sections
  GENERAL_SCOPING: [
    639, 111, 117, 118, 124, 157, 158, 167, 172, 177, 179, 180, 181, 185, 186, 191, 192, 200, 201,
    205, 207, 208, 209, 212, 213, 221, 222, 227, 228, 230, 231, 234, 235, 253, 256, 260, 266, 271,
    279, 282, 283, 294, 298, 301, 304, 312, 326, 362, 399, 486, 531, 617,
  ],
} as const;

/**
 * Flattened array of all excluded section IDs for easy querying
 */
export const ALL_EXCLUDED_SECTIONS = Object.values(EXCLUDED_SECTION_IDS).flat();

/**
 * Code IDs that are currently supported and should be exposed via the API
 */
export const SUPPORTED_CODE_IDS = [CODE_IDS.CBC_11A, CODE_IDS.CBC_11B, CODE_IDS.NYCBC_11B] as const;

// Type exports for better type safety
export type CodeId = (typeof CODE_IDS)[keyof typeof CODE_IDS];
export type SupportedCodeId = (typeof SUPPORTED_CODE_IDS)[number];
export type ChapterName = keyof typeof CHAPTER_FILTERS;

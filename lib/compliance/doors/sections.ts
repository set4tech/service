/**
 * Helper functions for identifying which door sections are covered by rule-based compliance
 */

import { CODE_TEXT } from './rules';

/**
 * Extract base section numbers from CODE_TEXT keys.
 * Keys are like '11B-404.2.3_clear_width', we extract '11B-404.2.3'.
 * This is the single source of truth - sections are derived from CODE_TEXT keys.
 */
function getBaseSectionNumbers(): string[] {
  const sections = new Set<string>();

  for (const key of Object.keys(CODE_TEXT)) {
    // Extract base section: split on underscore and take first part
    const baseSection = key.split('_')[0];
    sections.add(baseSection);
  }

  return Array.from(sections).sort();
}

export const RULE_COVERED_SECTIONS = getBaseSectionNumbers();

/**
 * Check if a section number is covered by door compliance rules
 */
export function isDoorRuleCovered(sectionNumber: string): boolean {
  // Check if it matches any of our covered sections (exact match or starts with)
  return RULE_COVERED_SECTIONS.some(
    covered => sectionNumber === covered || sectionNumber.startsWith(`${covered}.`)
  );
}

/**
 * Check if this is a California 11B project
 */
export function isCaliforniaProject(selectedCodeIds?: string[]): boolean {
  if (!selectedCodeIds || selectedCodeIds.length === 0) {
    return false;
  }

  return selectedCodeIds.some(codeId => codeId.includes('CBC') && codeId.includes('11B'));
}

/**
 * Split checks into rule-based and AI-based groups
 */
export function splitDoorChecks(checks: any[]): {
  ruleBasedChecks: any[];
  aiBasedChecks: any[];
} {
  const ruleBasedChecks: any[] = [];
  const aiBasedChecks: any[] = [];

  for (const check of checks) {
    if (isDoorRuleCovered(check.code_section_number)) {
      ruleBasedChecks.push(check);
    } else {
      aiBasedChecks.push(check);
    }
  }

  return { ruleBasedChecks, aiBasedChecks };
}

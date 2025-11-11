import { ValidationRule, DoorParameters } from '@/types/compliance';

/**
 * TODO: Define actual door compliance rules
 *
 * Each rule should:
 * 1. Map to one or more code sections (11A/11B)
 * 2. Have clear validation logic
 * 3. Return deterministic results when possible
 * 4. Flag contextual rules that need review
 *
 * Example rules to implement:
 * - Clear width minimum (11B-404.2.3)
 * - Door hardware type (11B-404.2.7)
 * - Opening force (11B-404.2.9)
 * - Maneuvering clearances (11B-404.2.4)
 * - Vision panels (11B-404.2.11)
 * - Threshold height (11B-404.2.5)
 * - Closing speed (11B-404.2.8)
 */

export const doorRules: ValidationRule<DoorParameters>[] = [
  // TODO: Implement actual rules
  // Placeholder example:
  {
    id: 'placeholder-rule',
    sectionNumbers: ['11B-404.2.3'],
    name: 'Placeholder Rule',
    description: 'This is a placeholder - implement actual rules later',
    validate: (_params: DoorParameters) => {
      return {
        section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404.2.3',
        section_number: '11B-404.2.3',
        section_title: 'Placeholder Section',
        rule_type: 'deterministic',
        status: 'needs_review',
        required_value: 'TBD',
        actual_value: 'TBD',
        passed: null,
        message: 'Rules not yet implemented',
        confidence: 'low',
        auto_applicable: false,
      };
    },
  },
];

/**
 * Get rules for specific code sections
 */
export function getRulesForSections(sectionNumbers: string[]): ValidationRule<DoorParameters>[] {
  return doorRules.filter(rule => rule.sectionNumbers.some(num => sectionNumbers.includes(num)));
}

/**
 * Get all applicable rules for door parameters
 */
export function getApplicableRules(_params: DoorParameters): ValidationRule<DoorParameters>[] {
  // TODO: Implement logic to filter rules based on door context
  // For now, return all rules
  return doorRules;
}

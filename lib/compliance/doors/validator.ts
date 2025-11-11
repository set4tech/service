import { ValidationResponse, DoorParameters } from '@/types/compliance';
import { doorRules, getRulesForSections, getApplicableRules } from './rules';
import { validateDoorParameters } from './parameters';

/**
 * Validate door parameters against California Building Code compliance rules
 *
 * @param parameters - Door-specific parameters (measurements, hardware, etc.)
 * @param codeSections - Optional array of specific section numbers to check
 * @param mode - 'all' checks all rules, 'applicable' filters by context
 * @returns Validation results with compliance status for each rule
 */
export async function validateDoorCompliance(
  parameters: DoorParameters,
  codeSections?: string[],
  mode: 'all' | 'applicable' = 'applicable'
): Promise<ValidationResponse> {
  // Validate parameters structure
  if (!validateDoorParameters(parameters)) {
    throw new Error('Invalid door parameters structure');
  }

  // Determine which rules to run
  const rulesToRun = codeSections
    ? getRulesForSections(codeSections)
    : mode === 'applicable'
      ? getApplicableRules(parameters)
      : doorRules;

  // Run all validation rules
  const results = rulesToRun.map(rule => {
    try {
      return rule.validate(parameters);
    } catch (error) {
      console.error(`Error running rule ${rule.id}:`, error);
      return {
        section_key: '',
        section_number: rule.sectionNumbers[0] || 'unknown',
        section_title: rule.name,
        rule_type: 'deterministic' as const,
        status: 'needs_review' as const,
        required_value: 'Error',
        actual_value: 'Error',
        passed: null,
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 'low' as const,
        auto_applicable: false,
      };
    }
  });

  // Calculate metadata
  const deterministicCount = results.filter(r => r.rule_type === 'deterministic').length;
  const contextualCount = results.filter(r => r.rule_type === 'contextual').length;

  return {
    results,
    validation_metadata: {
      rules_version: '1.0.0', // TODO: Version the rules
      total_sections_checked: results.length,
      deterministic_checks: deterministicCount,
      contextual_checks: contextualCount,
    },
  };
}

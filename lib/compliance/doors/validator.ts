import { ValidationResponse, DoorParameters, ValidationResult } from '@/types/compliance';
import { checkDoorCompliance } from './rules';
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
  _mode: 'all' | 'applicable' = 'applicable'
): Promise<ValidationResponse> {
  // Validate parameters structure
  if (!validateDoorParameters(parameters)) {
    throw new Error('Invalid door parameters structure');
  }

  // Check compliance and get violations
  const violations = checkDoorCompliance(parameters);

  // Convert violations to validation results
  const results: ValidationResult[] = violations.map(violation => {
    const sectionKey = `ICC:CBC_Chapter11A_11B:2025:CA:${violation.code_section}`;
    const passed = false; // All violations are failures

    return {
      section_key: sectionKey,
      section_number: violation.code_section,
      section_title: violation.code_text.substring(0, 100), // Truncate for title
      rule_type: 'deterministic', // Door rules are deterministic
      status: violation.severity === 'error' ? 'non_compliant' : 'needs_review',
      required_value:
        violation.required_value !== null && violation.required_value !== undefined
          ? `${violation.required_value}"`
          : 'See code text',
      actual_value:
        violation.measured_value !== null && violation.measured_value !== undefined
          ? `${violation.measured_value}"`
          : 'See description',
      passed,
      message: violation.description,
      confidence: 'high',
      auto_applicable: true,
    };
  });

  // If no violations, create compliant results for key sections
  if (results.length === 0) {
    // Add a summary result indicating compliance
    results.push({
      section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
      section_number: '11B-404',
      section_title: 'Doors, Doorways, and Gates',
      rule_type: 'deterministic',
      status: 'compliant',
      required_value: 'All requirements met',
      actual_value: 'All requirements met',
      passed: true,
      message: 'All CBC Section 11B-404 requirements are satisfied',
      confidence: 'high',
      auto_applicable: true,
    });
  }

  // Filter by specific code sections if requested
  const filteredResults = codeSections
    ? results.filter(r => codeSections.some(section => r.section_number.includes(section)))
    : results;

  // Calculate metadata
  const deterministicCount = filteredResults.filter(r => r.rule_type === 'deterministic').length;
  const contextualCount = filteredResults.filter(r => r.rule_type === 'contextual').length;

  return {
    results: filteredResults,
    validation_metadata: {
      rules_version: '1.0.0-cbc-11b-404',
      total_sections_checked: filteredResults.length,
      deterministic_checks: deterministicCount,
      contextual_checks: contextualCount,
    },
  };
}

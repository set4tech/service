/**
 * Compliance checking types for rules-based validation
 */

/**
 * TODO: Define actual door parameter structure
 * Should include measurements, hardware types, clearances, etc.
 *
 * Example fields to add later:
 * - clear_width_inches: number
 * - door_height_inches: number
 * - threshold_height_inches: number
 * - opening_force_lbf: number
 * - hardware_type: 'lever' | 'knob' | 'panic_bar' | 'push_plate'
 * - hardware_height_inches: number
 * - closing_speed_seconds: number
 * - latchside_clearance_inches: number
 * - etc.
 */
export interface DoorParameters {
  // Placeholder - define actual structure later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Result of a single rule validation
 */
export interface ValidationResult {
  section_key: string;
  section_number: string;
  section_title: string;
  rule_type: 'deterministic' | 'contextual';
  status: 'compliant' | 'non_compliant' | 'needs_review';
  required_value: string;
  actual_value: string;
  passed: boolean | null;
  message: string;
  confidence: 'high' | 'medium' | 'low';
  auto_applicable: boolean;
}

/**
 * Complete validation response
 */
export interface ValidationResponse {
  results: ValidationResult[];
  validation_metadata: {
    rules_version: string;
    total_sections_checked: number;
    deterministic_checks: number;
    contextual_checks: number;
  };
}

/**
 * Generic validation rule definition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ValidationRule<TParams = any> {
  id: string;
  sectionNumbers: string[];
  name: string;
  description: string;
  validate: (params: TParams) => ValidationResult;
}

/**
 * Compliance status
 */
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'needs_review' | 'pending';

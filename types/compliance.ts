/**
 * Compliance checking types for rules-based validation
 */

export interface Projection {
  height_above_floor_inches: number;
  depth_into_opening_inches: number;
}

export interface DoorParameters {
  // Basic properties
  is_on_accessible_route?: boolean;
  is_operated_only_by_security_personnel?: boolean;
  has_security_sign_visible_from_approach?: boolean;
  is_at_detention_or_correctional_facility?: boolean;

  // Door types
  is_revolving_door?: boolean;
  is_revolving_gate?: boolean;
  is_turnstile?: boolean;
  is_double_leaf?: boolean;
  is_sliding_door?: boolean;
  is_folding_door?: boolean;
  is_hinged_door?: boolean;
  is_pivoted_door?: boolean;
  is_automatic_door?: boolean;
  is_power_assisted_door?: boolean;
  is_gate?: boolean;

  // Dimensions
  clear_width_inches?: number | null;
  is_opening_depth_greater_than_24_inches?: boolean;
  door_open_angle_degrees?: number | null;
  doorway_width_inches?: number | null;

  // Projections and obstructions
  projections?: Projection[];
  latch_side_stop_projection_inches?: number | null;
  door_closer_height_above_floor_inches?: number | null;
  door_stop_height_above_floor_inches?: number | null;
  obstruction_projection_beyond_door_face_inches?: number | null;
  obstruction_distance_from_latch_side_inches?: number | null;

  // Physical clearances around the door (measured from door opening)
  // These are the actual physical spaces available on each side
  latch_side_clearance_inches?: number | null;
  hinge_side_clearance_inches?: number | null;
  pull_side_perpendicular_clearance_inches?: number | null;
  push_side_perpendicular_clearance_inches?: number | null;

  // Door hardware and features
  has_door_closer?: boolean;
  has_latch?: boolean;
  has_no_door_in_opening?: boolean;

  // Location properties
  is_exterior_door?: boolean;
  is_interior_doorway?: boolean;
  is_alteration_project?: boolean;

  // Series doors
  is_in_series_with_another_door?: boolean;
  distance_between_doors_in_series_inches?: number | null;
  width_of_door_swinging_into_space_between_series_inches?: number | null;

  // Automatic door properties
  complies_with_ANSI_BHMA_A156_10?: boolean | null;
  complies_with_ANSI_BHMA_A156_19?: boolean | null;
  clear_opening_power_on_inches?: number | null;
  clear_opening_power_off_inches?: number | null;
  automatic_door_leaf_angle_at_90_degrees_clear_opening_inches?: number | null;
  has_standby_power?: boolean | null;
  serves_accessible_means_of_egress?: boolean;
  remains_open_in_power_off_condition?: boolean | null;

  // Emergency and egress properties
  is_part_of_means_of_egress?: boolean;
  clear_break_out_opening_emergency_mode_inches?: number | null;
  has_manual_swinging_door_serving_same_egress?: boolean | null;
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

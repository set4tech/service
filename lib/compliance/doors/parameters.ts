import { DoorParameters } from '@/types/compliance';

/**
 * Validate door parameters structure
 * Checks that the provided object is a valid DoorParameters object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateDoorParameters(params: any): params is DoorParameters {
  // Basic type check
  if (typeof params !== 'object' || params === null) {
    return false;
  }

  // TODO: Add more specific validation if needed
  // For now, we accept any object as parameters are optional
  return true;
}

/**
 * Get default door parameters
 * Returns a door with sensible defaults for a standard hinged door
 */
export function getDefaultDoorParameters(): DoorParameters {
  return {
    // Basic properties
    is_on_accessible_route: true,
    is_operated_only_by_security_personnel: false,
    has_security_sign_visible_from_approach: false,
    is_at_detention_or_correctional_facility: false,

    // Door types - default to standard hinged door
    is_revolving_door: false,
    is_revolving_gate: false,
    is_turnstile: false,
    is_double_leaf: false,
    is_sliding_door: false,
    is_folding_door: false,
    is_hinged_door: true,
    is_pivoted_door: false,
    is_automatic_door: false,
    is_power_assisted_door: false,
    is_gate: false,

    // Dimensions
    clear_width_inches: null,
    is_opening_depth_greater_than_24_inches: false,
    door_open_angle_degrees: null,
    doorway_width_inches: null,

    // Projections and obstructions
    projections: [],
    latch_side_stop_projection_inches: null,
    door_closer_height_above_floor_inches: null,
    door_stop_height_above_floor_inches: null,
    obstruction_projection_beyond_door_face_inches: null,
    obstruction_distance_from_latch_side_inches: null,

    // Physical clearances
    latch_side_clearance_inches: null,
    hinge_side_clearance_inches: null,
    pull_side_perpendicular_clearance_inches: null,
    push_side_perpendicular_clearance_inches: null,

    // Door hardware and features
    has_door_closer: false,
    has_latch: false,
    has_no_door_in_opening: false,

    // Location properties
    is_exterior_door: false,
    is_interior_doorway: true,
    is_alteration_project: false,

    // Series doors
    is_in_series_with_another_door: false,
    distance_between_doors_in_series_inches: null,
    width_of_door_swinging_into_space_between_series_inches: null,

    // Automatic door properties
    complies_with_ANSI_BHMA_A156_10: null,
    complies_with_ANSI_BHMA_A156_19: null,
    clear_opening_power_on_inches: null,
    clear_opening_power_off_inches: null,
    automatic_door_leaf_angle_at_90_degrees_clear_opening_inches: null,
    has_standby_power: null,
    serves_accessible_means_of_egress: false,
    remains_open_in_power_off_condition: null,

    // Emergency and egress properties
    is_part_of_means_of_egress: false,
    clear_break_out_opening_emergency_mode_inches: null,
    has_manual_swinging_door_serving_same_egress: null,
  };
}

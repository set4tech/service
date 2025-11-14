import { DoorParameters, ComplianceViolation } from '@/types/compliance';

/**
 * CBC Section 11B-404 Door Compliance Checker
 *
 * This module checks door compliance based on California Building Code Section 11B-404.
 * It validates door parameters against accessibility requirements.
 *
 * ## Version Compatibility
 *
 * These rules work for both CBC 2022 and CBC 2025. The section numbers and requirements
 * are identical between versions. The system automatically uses the correct section keys
 * based on the project's selected code version:
 *
 * - Projects with CBC 2022 chapters → Uses `ICC:CBC:2022:CA:11B-404.x.x` section keys
 * - Projects with CBC 2025 chapters → Uses `ICC:CBC_Chapter11A_11B:2025:CA:11B-404.x.x` section keys
 *
 * The element_section_mappings table contains mappings for both versions, and the
 * get_element_sections() SQL function filters by the assessment's selected chapters.
 */

// Code section text for reference
export const CODE_TEXT: Record<string, string> = {
  '11B-404.2.1':
    'Revolving doors, revolving gates and turnstiles shall not be part of an accessible route.',
  '11B-404.2.3_clear_width':
    'Door openings shall provide a clear width of 32 inches (813 mm) minimum. Clear openings of doorways with swinging doors shall be measured between the face of the door and the stop, with the door open 90 degrees.',
  '11B-404.2.3_deep_opening':
    'Openings more than 24 inches (610 mm) deep shall provide a clear opening of 36 inches (914 mm) minimum.',
  '11B-404.2.3_projections_below_34':
    'Projections into the clear opening width between the stop and the door face shall not be permitted below 34 inches (864 mm) above the finish floor or ground.',
  '11B-404.2.3_projections_34_to_80':
    'Projections into the clear opening width between 34 inches (864 mm) and 80 inches (2032 mm) above the finish floor or ground shall not exceed 4 inches (102 mm).',
  '11B-404.2.3_latch_stop':
    'In alterations, a projection of 5/8 inch (15.9 mm) maximum into the required clear width shall be permitted for the latch side stop.',
  '11B-404.2.3_closer_height':
    'Door closers and door stops shall be permitted to be 78 inches (1981 mm) minimum above the finish floor or ground.',
  '11B-404.2.4.1_front_pull_perp':
    'Front approach, pull side: Minimum perpendicular maneuvering clearance of 60 inches (1524 mm).',
  '11B-404.2.4.1_front_pull_parallel':
    'Front approach, pull side: Minimum parallel maneuvering clearance (beyond latch side) of 18 inches (457 mm), or 24 inches (610 mm) at exterior side of exterior doors.',
  '11B-404.2.4.1_front_push_perp':
    'Front approach, push side: Minimum perpendicular maneuvering clearance of 48 inches (1219 mm), or 60 inches (1524 mm) if both closer and latch are provided.',
  '11B-404.2.4.1_hinge_pull_perp':
    'Hinge side approach, pull side: Minimum perpendicular maneuvering clearance of 60 inches (1524 mm).',
  '11B-404.2.4.1_hinge_pull_parallel':
    'Hinge side approach, pull side: Minimum parallel maneuvering clearance (beyond hinge side) of 36 inches (914 mm).',
  '11B-404.2.4.1_hinge_push_perp':
    'Hinge side approach, push side: Minimum perpendicular maneuvering clearance of 44 inches (1118 mm), or 48 inches (1219 mm) if both closer and latch are provided.',
  '11B-404.2.4.1_hinge_push_parallel':
    'Hinge side approach, push side: Minimum parallel maneuvering clearance (beyond hinge side) of 22 inches (559 mm), or 26 inches (660 mm) if both closer and latch are provided.',
  '11B-404.2.4.1_latch_pull_perp':
    'Latch side approach, pull side: Minimum perpendicular maneuvering clearance of 60 inches (1524 mm).',
  '11B-404.2.4.1_latch_pull_parallel':
    'Latch side approach, pull side: Minimum parallel maneuvering clearance (beyond latch side) of 24 inches (610 mm).',
  '11B-404.2.4.1_latch_push_perp':
    'Latch side approach, push side: Minimum perpendicular maneuvering clearance of 44 inches (1118 mm), or 48 inches (1219 mm) if closer is provided.',
  '11B-404.2.4.1_latch_push_parallel':
    'Latch side approach, push side: Minimum parallel maneuvering clearance (beyond latch side) of 24 inches (610 mm).',
  '11B-404.2.4.3':
    'Maneuvering clearances for forward approach shall be provided when any obstruction within 18 inches (457 mm) of the latch side of a doorway (interior doorway) or within 24 inches (610 mm) of the latch side of an exterior doorway projects more than 8 inches (203 mm) beyond the face of the door, measured perpendicular to the face of the door.',
  '11B-404.2.6':
    'The distance between two hinged or pivoted doors in series and gates in series shall be 48 inches (1219 mm) minimum plus the width of doors or gates swinging into the space.',
  '11B-404.3_auto_standard': 'Full-powered automatic doors shall comply with ANSI/BHMA A156.10.',
  '11B-404.3_power_assisted_standard':
    'Low-energy and power-assisted doors shall comply with ANSI/BHMA A156.19.',
  '11B-404.3.1_power_on':
    'Doorways shall provide a clear opening of 32 inches (813 mm) minimum in power-on mode.',
  '11B-404.3.1_power_off':
    'Doorways shall provide a clear opening of 32 inches (813 mm) minimum in power-off mode.',
  '11B-404.3.1_leaf_angle':
    'The minimum clear width for automatic door systems in a doorway shall provide a clear, unobstructed opening of 32 inches (813 mm) with all leaves in the open position.',
  '11B-404.3.6':
    'Where doors and gates without standby power are a part of a means of egress, the clear break out opening at swinging or sliding doors and gates shall be 32 inches (813 mm) minimum when operated in emergency mode.',
  '11B-404.3.7':
    'Revolving doors, revolving gates and turnstiles shall not be part of an accessible route.',
};

/**
 * Check all CBC Section 11B-404 compliance requirements for a door
 */
export function checkDoorCompliance(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Skip if not on accessible route
  if (!door.is_on_accessible_route) {
    return violations;
  }

  // Determine security exemptions
  const isSecurityExempt = isSecurityDoorExempt(door);

  // 11B-404.2.1 & 11B-404.3.7: Revolving doors/gates/turnstiles prohibition
  if (door.is_revolving_door) {
    const section =
      !door.is_automatic_door && !door.is_power_assisted_door ? '11B-404.2.1' : '11B-404.3.7';
    violations.push({
      code_section: section,
      code_text: CODE_TEXT[section],
      description: 'Revolving door is not permitted on accessible route',
      severity: 'error',
    });
  }
  if (door.is_revolving_gate) {
    const section =
      !door.is_automatic_door && !door.is_power_assisted_door ? '11B-404.2.1' : '11B-404.3.7';
    violations.push({
      code_section: section,
      code_text: CODE_TEXT[section],
      description: 'Revolving gate is not permitted on accessible route',
      severity: 'error',
    });
  }
  if (door.is_turnstile) {
    const section =
      !door.is_automatic_door && !door.is_power_assisted_door ? '11B-404.2.1' : '11B-404.3.7';
    violations.push({
      code_section: section,
      code_text: CODE_TEXT[section],
      description: 'Turnstile is not permitted on accessible route',
      severity: 'error',
    });
  }

  // Check manual door requirements
  if (!door.is_automatic_door && !door.is_power_assisted_door) {
    violations.push(...checkManualDoorCompliance(door, isSecurityExempt));
  }

  // Check automatic/power-assisted door requirements
  if (door.is_automatic_door || door.is_power_assisted_door) {
    violations.push(...checkAutomaticDoorCompliance(door, isSecurityExempt));
  }

  return violations;
}

/**
 * Determine if door qualifies for security personnel exemptions
 */
function isSecurityDoorExempt(door: DoorParameters): boolean {
  if (!door.is_operated_only_by_security_personnel) {
    return false;
  }

  // At detention/correctional facilities, no sign required
  if (door.is_at_detention_or_correctional_facility) {
    return true;
  }

  // Otherwise, requires visible security sign
  return !!door.has_security_sign_visible_from_approach;
}

/**
 * Check compliance for manual doors under 11B-404.2
 */
function checkManualDoorCompliance(
  door: DoorParameters,
  _isSecurityExempt: boolean
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // 11B-404.2.3: Clear width
  violations.push(...checkClearWidth(door));

  // 11B-404.2.4: Maneuvering clearances
  violations.push(...checkManeuveringClearances(door));

  // 11B-404.2.4.3: Recessed doors
  violations.push(...checkRecessedDoor(door));

  // 11B-404.2.6: Doors in series
  if (door.is_in_series_with_another_door) {
    violations.push(...checkDoorsInSeries(door));
  }

  return violations;
}

/**
 * Check 11B-404.2.3 clear width requirements
 */
function checkClearWidth(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Basic 32" minimum
  if (door.clear_width_inches !== null && door.clear_width_inches !== undefined) {
    if (door.clear_width_inches < 32) {
      violations.push({
        code_section: '11B-404.2.3',
        code_text: CODE_TEXT['11B-404.2.3_clear_width'],
        description: 'Door clear width is less than required minimum',
        severity: 'error',
        measured_value: door.clear_width_inches,
        required_value: 32.0,
      });
    }

    // Deep openings require 36"
    if (door.is_opening_depth_greater_than_24_inches && door.clear_width_inches < 36) {
      violations.push({
        code_section: '11B-404.2.3',
        code_text: CODE_TEXT['11B-404.2.3_deep_opening'],
        description: 'Opening depth greater than 24 inches requires 36 inches minimum clear width',
        severity: 'error',
        measured_value: door.clear_width_inches,
        required_value: 36.0,
      });
    }
  }

  // Check projections
  if (door.projections) {
    for (const proj of door.projections) {
      if (proj.height_above_floor_inches < 34) {
        if (proj.depth_into_opening_inches > 0) {
          violations.push({
            code_section: '11B-404.2.3',
            code_text: CODE_TEXT['11B-404.2.3_projections_below_34'],
            description: `Projection found at ${proj.height_above_floor_inches}" height (below 34") extends ${proj.depth_into_opening_inches}" into clear opening`,
            severity: 'error',
            measured_value: proj.depth_into_opening_inches,
            required_value: 0.0,
          });
        }
      } else if (proj.height_above_floor_inches >= 34 && proj.height_above_floor_inches <= 80) {
        const maxProjection = 4.0;
        if (proj.depth_into_opening_inches > maxProjection) {
          violations.push({
            code_section: '11B-404.2.3',
            code_text: CODE_TEXT['11B-404.2.3_projections_34_to_80'],
            description: `Projection at ${proj.height_above_floor_inches}" height extends ${proj.depth_into_opening_inches}" into clear opening (exceeds 4" maximum)`,
            severity: 'error',
            measured_value: proj.depth_into_opening_inches,
            required_value: maxProjection,
          });
        }
      }
    }
  }

  // Exception 1: Alterations allow 5/8" latch side stop projection
  if (
    door.latch_side_stop_projection_inches !== null &&
    door.latch_side_stop_projection_inches !== undefined
  ) {
    const maxAllowed = door.is_alteration_project ? 0.625 : 0.0;
    if (door.latch_side_stop_projection_inches > maxAllowed) {
      violations.push({
        code_section: '11B-404.2.3',
        code_text: door.is_alteration_project
          ? CODE_TEXT['11B-404.2.3_latch_stop']
          : CODE_TEXT['11B-404.2.3_clear_width'],
        description: `Latch side stop projection exceeds maximum for ${door.is_alteration_project ? 'alteration' : 'new construction'}`,
        severity: 'error',
        measured_value: door.latch_side_stop_projection_inches,
        required_value: maxAllowed,
      });
    }
  }

  // Exception 2: Door closers and stops can be at 78" minimum
  if (
    door.door_closer_height_above_floor_inches !== null &&
    door.door_closer_height_above_floor_inches !== undefined
  ) {
    if (door.door_closer_height_above_floor_inches < 78) {
      violations.push({
        code_section: '11B-404.2.3',
        code_text: CODE_TEXT['11B-404.2.3_closer_height'],
        description: 'Door closer height is below minimum',
        severity: 'error',
        measured_value: door.door_closer_height_above_floor_inches,
        required_value: 78.0,
      });
    }
  }

  if (
    door.door_stop_height_above_floor_inches !== null &&
    door.door_stop_height_above_floor_inches !== undefined
  ) {
    if (door.door_stop_height_above_floor_inches < 78) {
      violations.push({
        code_section: '11B-404.2.3',
        code_text: CODE_TEXT['11B-404.2.3_closer_height'],
        description: 'Door stop height is below minimum',
        severity: 'error',
        measured_value: door.door_stop_height_above_floor_inches,
        required_value: 78.0,
      });
    }
  }

  return violations;
}

/**
 * Check 11B-404.2.4 maneuvering clearance requirements for all approach directions
 */
function checkManeuveringClearances(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Skip if no door, sliding, or folding (different rules)
  if (door.has_no_door_in_opening || door.is_sliding_door || door.is_folding_door) {
    return checkSpecialDoorManeuveringClearances(door);
  }

  // 11B-404.2.4.1: Check all swinging door approach scenarios

  // Front approach - pull side
  if (
    door.pull_side_perpendicular_clearance_inches !== null &&
    door.pull_side_perpendicular_clearance_inches !== undefined &&
    door.latch_side_clearance_inches !== null &&
    door.latch_side_clearance_inches !== undefined
  ) {
    const requiredPerp = 60.0;
    let requiredParallel = 18.0;
    if (door.is_exterior_door) {
      requiredParallel = 24.0;
    }

    if (door.pull_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_front_pull_perp'],
        description: 'Insufficient perpendicular maneuvering clearance',
        severity: 'error',
        measured_value: door.pull_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'front_pull',
      });
    }

    if (door.latch_side_clearance_inches < requiredParallel) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_front_pull_parallel'],
        description: `Insufficient latch side clearance (${door.is_exterior_door ? 'exterior' : 'interior'} door)`,
        severity: 'error',
        measured_value: door.latch_side_clearance_inches,
        required_value: requiredParallel,
        approach_direction: 'front_pull',
      });
    }
  }

  // Front approach - push side
  if (
    door.push_side_perpendicular_clearance_inches !== null &&
    door.push_side_perpendicular_clearance_inches !== undefined
  ) {
    let requiredPerp = 48.0;
    if (door.has_door_closer && door.has_latch) {
      requiredPerp = 60.0;
    }

    if (door.push_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_front_push_perp'],
        description: `Insufficient perpendicular maneuvering clearance (${requiredPerp === 60.0 ? 'with closer and latch' : 'without closer/latch'})`,
        severity: 'error',
        measured_value: door.push_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'front_push',
      });
    }
  }

  // Hinge side approach - pull side
  if (
    door.pull_side_perpendicular_clearance_inches !== null &&
    door.pull_side_perpendicular_clearance_inches !== undefined &&
    door.hinge_side_clearance_inches !== null &&
    door.hinge_side_clearance_inches !== undefined
  ) {
    const requiredPerp = 60.0;
    const requiredParallel = 36.0;

    if (door.pull_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_hinge_pull_perp'],
        description: 'Insufficient perpendicular maneuvering clearance',
        severity: 'error',
        measured_value: door.pull_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'hinge_pull',
      });
    }

    if (door.hinge_side_clearance_inches < requiredParallel) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_hinge_pull_parallel'],
        description: 'Insufficient hinge side clearance',
        severity: 'error',
        measured_value: door.hinge_side_clearance_inches,
        required_value: requiredParallel,
        approach_direction: 'hinge_pull',
      });
    }
  }

  // Hinge side approach - push side
  if (
    door.push_side_perpendicular_clearance_inches !== null &&
    door.push_side_perpendicular_clearance_inches !== undefined &&
    door.hinge_side_clearance_inches !== null &&
    door.hinge_side_clearance_inches !== undefined
  ) {
    let requiredPerp = 44.0;
    let requiredParallel = 22.0;
    if (door.has_door_closer && door.has_latch) {
      requiredPerp = 48.0;
      requiredParallel = 26.0;
    }

    if (door.push_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_hinge_push_perp'],
        description: `Insufficient perpendicular maneuvering clearance (${requiredPerp === 48.0 ? 'with closer and latch' : 'without closer/latch'})`,
        severity: 'error',
        measured_value: door.push_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'hinge_push',
      });
    }

    if (door.hinge_side_clearance_inches < requiredParallel) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_hinge_push_parallel'],
        description: `Insufficient hinge side clearance (${requiredParallel === 26.0 ? 'with closer and latch' : 'without closer/latch'})`,
        severity: 'error',
        measured_value: door.hinge_side_clearance_inches,
        required_value: requiredParallel,
        approach_direction: 'hinge_push',
      });
    }
  }

  // Latch side approach - pull side
  if (
    door.pull_side_perpendicular_clearance_inches !== null &&
    door.pull_side_perpendicular_clearance_inches !== undefined &&
    door.latch_side_clearance_inches !== null &&
    door.latch_side_clearance_inches !== undefined
  ) {
    const requiredPerp = 60.0;
    const requiredParallel = 24.0;

    if (door.pull_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_latch_pull_perp'],
        description: 'Insufficient perpendicular maneuvering clearance',
        severity: 'error',
        measured_value: door.pull_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'latch_pull',
      });
    }

    if (door.latch_side_clearance_inches < requiredParallel) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_latch_pull_parallel'],
        description: 'Insufficient latch side clearance',
        severity: 'error',
        measured_value: door.latch_side_clearance_inches,
        required_value: requiredParallel,
        approach_direction: 'latch_pull',
      });
    }
  }

  // Latch side approach - push side
  if (
    door.push_side_perpendicular_clearance_inches !== null &&
    door.push_side_perpendicular_clearance_inches !== undefined &&
    door.latch_side_clearance_inches !== null &&
    door.latch_side_clearance_inches !== undefined
  ) {
    let requiredPerp = 44.0;
    if (door.has_door_closer) {
      requiredPerp = 48.0;
    }
    const requiredParallel = 24.0;

    if (door.push_side_perpendicular_clearance_inches < requiredPerp) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_latch_push_perp'],
        description: `Insufficient perpendicular maneuvering clearance (${requiredPerp === 48.0 ? 'with closer' : 'without closer'})`,
        severity: 'error',
        measured_value: door.push_side_perpendicular_clearance_inches,
        required_value: requiredPerp,
        approach_direction: 'latch_push',
      });
    }

    if (door.latch_side_clearance_inches < requiredParallel) {
      violations.push({
        code_section: '11B-404.2.4.1',
        code_text: CODE_TEXT['11B-404.2.4.1_latch_push_parallel'],
        description: 'Insufficient latch side clearance',
        severity: 'error',
        measured_value: door.latch_side_clearance_inches,
        required_value: requiredParallel,
        approach_direction: 'latch_push',
      });
    }
  }

  return violations;
}

/**
 * Check 11B-404.2.4.2 maneuvering clearances for doorways without doors, sliding, or folding doors
 */
function checkSpecialDoorManeuveringClearances(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Only applies to doorways < 36" wide
  if (
    door.doorway_width_inches !== null &&
    door.doorway_width_inches !== undefined &&
    door.doorway_width_inches >= 36
  ) {
    return violations;
  }

  // For sliding/folding doors or doorways without doors, we need different clearance measurements
  // This would need additional parameters for these specific door types
  // For now, returning empty list as the physical clearance model needs to be extended for these cases

  return violations;
}

/**
 * Check 11B-404.2.4.3 recessed door requirements
 */
function checkRecessedDoor(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  if (
    door.obstruction_projection_beyond_door_face_inches === null ||
    door.obstruction_projection_beyond_door_face_inches === undefined
  ) {
    return violations;
  }

  if (door.obstruction_projection_beyond_door_face_inches <= 8) {
    return violations;
  }

  // Obstruction projects > 8" beyond door face
  if (
    door.obstruction_distance_from_latch_side_inches === null ||
    door.obstruction_distance_from_latch_side_inches === undefined
  ) {
    return violations;
  }

  // Interior doorway: within 18" of latch side triggers requirement
  if (door.is_interior_doorway && door.obstruction_distance_from_latch_side_inches <= 18) {
    // Must provide maneuvering clearance for forward approach
    // Check if we have the front approach clearances
    if (
      door.pull_side_perpendicular_clearance_inches !== null &&
      door.pull_side_perpendicular_clearance_inches !== undefined
    ) {
      const requiredPerp = 60.0;
      if (door.pull_side_perpendicular_clearance_inches < requiredPerp) {
        violations.push({
          code_section: '11B-404.2.4.3',
          code_text: CODE_TEXT['11B-404.2.4.3'],
          description:
            'Recessed interior door requires forward approach maneuvering clearance (obstruction > 8" within 18" of latch)',
          severity: 'error',
          measured_value: door.pull_side_perpendicular_clearance_inches,
          required_value: requiredPerp,
        });
      }
    }
  }

  // Exterior doorway: within 24" of latch side triggers requirement
  if (door.is_exterior_door && door.obstruction_distance_from_latch_side_inches <= 24) {
    if (
      door.pull_side_perpendicular_clearance_inches !== null &&
      door.pull_side_perpendicular_clearance_inches !== undefined
    ) {
      const requiredPerp = 60.0;
      if (door.pull_side_perpendicular_clearance_inches < requiredPerp) {
        violations.push({
          code_section: '11B-404.2.4.3',
          code_text: CODE_TEXT['11B-404.2.4.3'],
          description:
            'Recessed exterior door requires forward approach maneuvering clearance (obstruction > 8" within 24" of latch)',
          severity: 'error',
          measured_value: door.pull_side_perpendicular_clearance_inches,
          required_value: requiredPerp,
        });
      }
    }
  }

  return violations;
}

/**
 * Check 11B-404.2.6 doors in series requirements
 */
function checkDoorsInSeries(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  if (!door.is_in_series_with_another_door) {
    return violations;
  }

  if (
    door.distance_between_doors_in_series_inches === null ||
    door.distance_between_doors_in_series_inches === undefined
  ) {
    return violations;
  }

  // Must be hinged or pivoted to apply
  if (!door.is_hinged_door && !door.is_pivoted_door) {
    return violations;
  }

  let minDistance = 48.0;
  if (
    door.width_of_door_swinging_into_space_between_series_inches !== null &&
    door.width_of_door_swinging_into_space_between_series_inches !== undefined
  ) {
    minDistance += door.width_of_door_swinging_into_space_between_series_inches;
  }

  if (door.distance_between_doors_in_series_inches < minDistance) {
    violations.push({
      code_section: '11B-404.2.6',
      code_text: CODE_TEXT['11B-404.2.6'],
      description: 'Insufficient distance between doors in series',
      severity: 'error',
      measured_value: door.distance_between_doors_in_series_inches,
      required_value: minDistance,
    });
  }

  return violations;
}

/**
 * Check compliance for automatic and power-assisted doors under 11B-404.3
 */
function checkAutomaticDoorCompliance(
  door: DoorParameters,
  _isSecurityExempt: boolean
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Standards compliance
  if (door.is_automatic_door && !door.is_power_assisted_door) {
    if (door.complies_with_ANSI_BHMA_A156_10 === false) {
      violations.push({
        code_section: '11B-404.3',
        code_text: CODE_TEXT['11B-404.3_auto_standard'],
        description: 'Automatic door does not comply with required standard',
        severity: 'error',
      });
    }
  }

  if (door.is_power_assisted_door) {
    if (door.complies_with_ANSI_BHMA_A156_19 === false) {
      violations.push({
        code_section: '11B-404.3',
        code_text: CODE_TEXT['11B-404.3_power_assisted_standard'],
        description: 'Power-assisted door does not comply with required standard',
        severity: 'error',
      });
    }
  }

  // 11B-404.3.1: Clear width
  violations.push(...checkAutomaticDoorClearWidth(door));

  // 11B-404.3.2: Maneuvering clearance
  violations.push(...checkAutomaticDoorManeuveringClearance(door));

  // 11B-404.3.4: Doors in series
  if (door.is_in_series_with_another_door) {
    violations.push(...checkDoorsInSeries(door));
  }

  // 11B-404.3.6: Break out opening
  violations.push(...checkBreakOutOpening(door));

  return violations;
}

/**
 * Check 11B-404.3.1 clear width for automatic doors
 */
function checkAutomaticDoorClearWidth(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  if (
    door.clear_opening_power_on_inches !== null &&
    door.clear_opening_power_on_inches !== undefined
  ) {
    if (door.clear_opening_power_on_inches < 32) {
      violations.push({
        code_section: '11B-404.3.1',
        code_text: CODE_TEXT['11B-404.3.1_power_on'],
        description: 'Insufficient clear opening in power-on mode',
        severity: 'error',
        measured_value: door.clear_opening_power_on_inches,
        required_value: 32.0,
      });
    }
  }

  if (
    door.clear_opening_power_off_inches !== null &&
    door.clear_opening_power_off_inches !== undefined
  ) {
    if (door.clear_opening_power_off_inches < 32) {
      violations.push({
        code_section: '11B-404.3.1',
        code_text: CODE_TEXT['11B-404.3.1_power_off'],
        description: 'Insufficient clear opening in power-off mode',
        severity: 'error',
        measured_value: door.clear_opening_power_off_inches,
        required_value: 32.0,
      });
    }
  }

  if (
    door.automatic_door_leaf_angle_at_90_degrees_clear_opening_inches !== null &&
    door.automatic_door_leaf_angle_at_90_degrees_clear_opening_inches !== undefined
  ) {
    if (door.automatic_door_leaf_angle_at_90_degrees_clear_opening_inches < 32) {
      violations.push({
        code_section: '11B-404.3.1',
        code_text: CODE_TEXT['11B-404.3.1_leaf_angle'],
        description: 'Insufficient clear opening with door leaf at 90 degrees',
        severity: 'error',
        measured_value: door.automatic_door_leaf_angle_at_90_degrees_clear_opening_inches,
        required_value: 32.0,
      });
    }
  }

  return violations;
}

/**
 * Check 11B-404.3.2 maneuvering clearance for automatic doors
 */
function checkAutomaticDoorManeuveringClearance(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Exception: Doors that remain open in power-off are exempt
  if (door.remains_open_in_power_off_condition) {
    return violations;
  }

  // Power-assisted doors must comply with 11B-404.2.4
  if (door.is_power_assisted_door) {
    violations.push(...checkManeuveringClearances(door));
  }

  // Automatic doors without standby power serving accessible means of egress
  if (door.is_automatic_door && !door.has_standby_power && door.serves_accessible_means_of_egress) {
    violations.push(...checkManeuveringClearances(door));
  }

  return violations;
}

/**
 * Check 11B-404.3.6 break out opening for doors without standby power
 */
function checkBreakOutOpening(door: DoorParameters): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Only applies to doors without standby power that are part of means of egress
  if (door.has_standby_power || !door.is_part_of_means_of_egress) {
    return violations;
  }

  // Exception: If manual swinging doors serving same egress comply with 11B-404.2
  if (door.has_manual_swinging_door_serving_same_egress) {
    return violations;
  }

  if (
    door.clear_break_out_opening_emergency_mode_inches !== null &&
    door.clear_break_out_opening_emergency_mode_inches !== undefined
  ) {
    if (door.clear_break_out_opening_emergency_mode_inches < 32) {
      violations.push({
        code_section: '11B-404.3.6',
        code_text: CODE_TEXT['11B-404.3.6'],
        description: 'Insufficient clear break out opening in emergency mode',
        severity: 'error',
        measured_value: door.clear_break_out_opening_emergency_mode_inches,
        required_value: 32.0,
      });
    }
  }

  return violations;
}

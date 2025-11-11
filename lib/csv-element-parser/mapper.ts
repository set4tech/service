/**
 * Maps CSV door measurements to DoorParameters
 */

import { DoorParameters } from '@/types/compliance';
import { ParsedDoor } from './types';

/**
 * Convert parsed door to DoorParameters
 */
export function mapToDoorParameters(door: ParsedDoor): Partial<DoorParameters> {
  const params: Partial<DoorParameters> = {
    // Defaults
    is_on_accessible_route: true,
    is_hinged_door: true, // Assumption from measurement types

    // Clear width from Width measurement
    clear_width_inches: door.measurements.width || null,

    // Maneuvering clearances - perpendicular (front)
    pull_side_perpendicular_clearance_inches: door.measurements.frontPull || null,
    push_side_perpendicular_clearance_inches: door.measurements.frontPush || null,

    // Latch side clearance (use either pull or push, prefer pull)
    latch_side_clearance_inches: door.measurements.pullLatch || door.measurements.pushLatch || null,

    // Hinge side clearance
    hinge_side_clearance_inches: door.measurements.hingePush || null,

    // Infer has_latch from presence of latch measurements
    has_latch: !!(door.measurements.pullLatch || door.measurements.pushLatch),

    // These should be filled in manually by user:
    // - has_door_closer: undefined,
    // - is_exterior_door: undefined,
    // - etc.
  };

  return params;
}

/**
 * Create a summary of what measurements were found
 */
export function getMeasurementSummary(door: ParsedDoor): {
  found: string[];
  missing: string[];
} {
  const found: string[] = [];
  const missing: string[] = [];

  const checks = [
    { key: 'frontPull', label: 'Front, pull' },
    { key: 'frontPush', label: 'Front, push' },
    { key: 'pullLatch', label: 'Pull, latch' },
    { key: 'pushLatch', label: 'Push, latch' },
    { key: 'hingePush', label: 'Hinge, push' },
    { key: 'width', label: 'Width' },
  ];

  for (const check of checks) {
    const value = door.measurements[check.key as keyof typeof door.measurements];
    if (value !== undefined && value !== null) {
      found.push(`${check.label}: ${value}"`);
    } else {
      missing.push(check.label);
    }
  }

  return { found, missing };
}

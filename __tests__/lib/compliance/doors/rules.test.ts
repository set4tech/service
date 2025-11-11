import { describe, it, expect } from 'vitest';
import { checkDoorCompliance, CODE_TEXT } from '@/lib/compliance/doors/rules';
import { DoorParameters } from '@/types/compliance';

/**
 * Comprehensive test suite for CBC Section 11B-404 Door Compliance Checker
 *
 * Tests cover all requirements from:
 * - 11B-404.2 Manual Doors
 * - 11B-404.3 Automatic and Power-Assisted Doors
 */

describe('checkDoorCompliance', () => {
  describe('General - Accessible Route', () => {
    it('should return no violations for door not on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: false,
        is_revolving_door: true, // Even with violations, should return empty
        clear_width_inches: 20, // Below minimum
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toHaveLength(0);
    });
  });

  describe('11B-404.2.1 - Revolving Doors, Gates and Turnstiles (Manual)', () => {
    it('should flag revolving door on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_revolving_door: true,
        is_automatic_door: false,
        is_power_assisted_door: false,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.1',
          description: 'Revolving door is not permitted on accessible route',
          severity: 'error',
        })
      );
    });

    it('should flag revolving gate on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_revolving_gate: true,
        is_automatic_door: false,
        is_power_assisted_door: false,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.1',
          description: 'Revolving gate is not permitted on accessible route',
          severity: 'error',
        })
      );
    });

    it('should flag turnstile on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_turnstile: true,
        is_automatic_door: false,
        is_power_assisted_door: false,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.1',
          description: 'Turnstile is not permitted on accessible route',
          severity: 'error',
        })
      );
    });

    it('should not flag regular door', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_revolving_door: false,
        is_revolving_gate: false,
        is_turnstile: false,
      };

      const violations = checkDoorCompliance(door);
      const revolvingViolations = violations.filter(v => v.code_section === '11B-404.2.1');
      expect(revolvingViolations).toHaveLength(0);
    });
  });

  describe('11B-404.2.3 - Clear Width', () => {
    describe('Basic 32-inch minimum', () => {
      it('should flag door with clear width less than 32 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 30,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: 'Door clear width is less than required minimum',
            severity: 'error',
            measured_value: 30,
            required_value: 32.0,
          })
        );
      });

      it('should pass door with clear width of exactly 32 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
        };

        const violations = checkDoorCompliance(door);
        const clearWidthViolations = violations.filter(
          v =>
            v.code_section === '11B-404.2.3' && v.code_text === CODE_TEXT['11B-404.2.3_clear_width']
        );
        expect(clearWidthViolations).toHaveLength(0);
      });

      it('should pass door with clear width greater than 32 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 36,
        };

        const violations = checkDoorCompliance(door);
        const clearWidthViolations = violations.filter(
          v =>
            v.code_section === '11B-404.2.3' && v.code_text === CODE_TEXT['11B-404.2.3_clear_width']
        );
        expect(clearWidthViolations).toHaveLength(0);
      });
    });

    describe('Deep openings (>24 inches) require 36 inches', () => {
      it('should flag deep opening with less than 36 inches clear width', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 34,
          is_opening_depth_greater_than_24_inches: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description:
              'Opening depth greater than 24 inches requires 36 inches minimum clear width',
            severity: 'error',
            measured_value: 34,
            required_value: 36.0,
          })
        );
      });

      it('should pass deep opening with 36 inches clear width', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 36,
          is_opening_depth_greater_than_24_inches: true,
        };

        const violations = checkDoorCompliance(door);
        const deepOpeningViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_deep_opening']
        );
        expect(deepOpeningViolations).toHaveLength(0);
      });

      it('should pass shallow opening with 32 inches clear width', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          is_opening_depth_greater_than_24_inches: false,
        };

        const violations = checkDoorCompliance(door);
        const deepOpeningViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_deep_opening']
        );
        expect(deepOpeningViolations).toHaveLength(0);
      });
    });

    describe('Projections below 34 inches', () => {
      it('should flag any projection below 34 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          projections: [{ height_above_floor_inches: 30, depth_into_opening_inches: 2 }],
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: expect.stringContaining('Projection found at 30"'),
            severity: 'error',
            measured_value: 2,
            required_value: 0.0,
          })
        );
      });

      it('should pass with no projections below 34 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          projections: [{ height_above_floor_inches: 30, depth_into_opening_inches: 0 }],
        };

        const violations = checkDoorCompliance(door);
        const projectionViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_projections_below_34']
        );
        expect(projectionViolations).toHaveLength(0);
      });
    });

    describe('Projections between 34 and 80 inches', () => {
      it('should flag projections exceeding 4 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          projections: [{ height_above_floor_inches: 50, depth_into_opening_inches: 5 }],
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: expect.stringContaining('Projection at 50"'),
            severity: 'error',
            measured_value: 5,
            required_value: 4.0,
          })
        );
      });

      it('should pass with projections of exactly 4 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          projections: [{ height_above_floor_inches: 50, depth_into_opening_inches: 4 }],
        };

        const violations = checkDoorCompliance(door);
        const projectionViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_projections_34_to_80']
        );
        expect(projectionViolations).toHaveLength(0);
      });

      it('should pass with projections less than 4 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          projections: [{ height_above_floor_inches: 50, depth_into_opening_inches: 3 }],
        };

        const violations = checkDoorCompliance(door);
        const projectionViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_projections_34_to_80']
        );
        expect(projectionViolations).toHaveLength(0);
      });
    });

    describe('Exception 1: Latch side stop projection in alterations', () => {
      it('should allow 5/8 inch latch side stop projection in alterations', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          latch_side_stop_projection_inches: 0.625,
          is_alteration_project: true,
        };

        const violations = checkDoorCompliance(door);
        const latchStopViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_latch_stop']
        );
        expect(latchStopViolations).toHaveLength(0);
      });

      it('should flag latch side stop projection exceeding 5/8 inch in alterations', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          latch_side_stop_projection_inches: 0.7,
          is_alteration_project: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: expect.stringContaining('alteration'),
            severity: 'error',
            measured_value: 0.7,
            required_value: 0.625,
          })
        );
      });

      it('should not allow latch side stop projection in new construction', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          latch_side_stop_projection_inches: 0.5,
          is_alteration_project: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: expect.stringContaining('new construction'),
            severity: 'error',
            measured_value: 0.5,
            required_value: 0.0,
          })
        );
      });
    });

    describe('Exception 2: Door closers and stops at 78 inches minimum', () => {
      it('should pass door closer at 78 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          door_closer_height_above_floor_inches: 78,
        };

        const violations = checkDoorCompliance(door);
        const closerHeightViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.3_closer_height']
        );
        expect(closerHeightViolations).toHaveLength(0);
      });

      it('should flag door closer below 78 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          door_closer_height_above_floor_inches: 75,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: 'Door closer height is below minimum',
            severity: 'error',
            measured_value: 75,
            required_value: 78.0,
          })
        );
      });

      it('should pass door stop at 78 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          door_stop_height_above_floor_inches: 78,
        };

        const violations = checkDoorCompliance(door);
        const stopHeightViolations = violations.filter(
          v =>
            v.code_text === CODE_TEXT['11B-404.2.3_closer_height'] && v.description.includes('stop')
        );
        expect(stopHeightViolations).toHaveLength(0);
      });

      it('should flag door stop below 78 inches', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          clear_width_inches: 32,
          door_stop_height_above_floor_inches: 76,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.3',
            description: 'Door stop height is below minimum',
            severity: 'error',
            measured_value: 76,
            required_value: 78.0,
          })
        );
      });
    });
  });

  describe('11B-404.2.4.1 - Swinging Doors Maneuvering Clearances', () => {
    describe('Front Approach - Pull Side', () => {
      it('should flag insufficient perpendicular clearance (<60 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 55,
          latch_side_clearance_inches: 18,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: 'Insufficient perpendicular maneuvering clearance',
            severity: 'error',
            measured_value: 55,
            required_value: 60.0,
            approach_direction: 'front_pull',
          })
        );
      });

      it('should pass with 60 inches perpendicular clearance', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 18,
        };

        const violations = checkDoorCompliance(door);
        const frontPullPerpViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.4.1_front_pull_perp']
        );
        expect(frontPullPerpViolations).toHaveLength(0);
      });

      it('should flag insufficient latch side clearance for interior door (<18 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 15,
          is_exterior_door: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: expect.stringContaining('interior'),
            severity: 'error',
            measured_value: 15,
            required_value: 18.0,
            approach_direction: 'front_pull',
          })
        );
      });

      it('should flag insufficient latch side clearance for exterior door (<24 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 20,
          is_exterior_door: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: expect.stringContaining('exterior'),
            severity: 'error',
            measured_value: 20,
            required_value: 24.0,
            approach_direction: 'front_pull',
          })
        );
      });

      it('should pass exterior door with 24 inches latch side clearance', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 24,
          is_exterior_door: true,
        };

        const violations = checkDoorCompliance(door);
        const frontPullParallelViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.4.1_front_pull_parallel']
        );
        expect(frontPullParallelViolations).toHaveLength(0);
      });
    });

    describe('Front Approach - Push Side', () => {
      it('should flag insufficient perpendicular clearance without closer/latch (<48 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 45,
          has_door_closer: false,
          has_latch: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: expect.stringContaining('without closer/latch'),
            severity: 'error',
            measured_value: 45,
            required_value: 48.0,
            approach_direction: 'front_push',
          })
        );
      });

      it('should flag insufficient perpendicular clearance with closer and latch (<60 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 55,
          has_door_closer: true,
          has_latch: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: expect.stringContaining('with closer and latch'),
            severity: 'error',
            measured_value: 55,
            required_value: 60.0,
            approach_direction: 'front_push',
          })
        );
      });

      it('should pass with 48 inches without closer/latch', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 48,
          has_door_closer: false,
          has_latch: false,
        };

        const violations = checkDoorCompliance(door);
        const frontPushPerpViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.4.1_front_push_perp']
        );
        expect(frontPushPerpViolations).toHaveLength(0);
      });

      it('should pass with 60 inches with closer and latch', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 60,
          has_door_closer: true,
          has_latch: true,
        };

        const violations = checkDoorCompliance(door);
        const frontPushPerpViolations = violations.filter(
          v => v.code_text === CODE_TEXT['11B-404.2.4.1_front_push_perp']
        );
        expect(frontPushPerpViolations).toHaveLength(0);
      });
    });

    describe('Hinge Side Approach - Pull Side', () => {
      it('should flag insufficient perpendicular clearance (<60 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 55,
          hinge_side_clearance_inches: 36,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            approach_direction: 'hinge_pull',
          })
        );
      });

      it('should flag insufficient hinge side clearance (<36 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          hinge_side_clearance_inches: 30,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: 'Insufficient hinge side clearance',
            severity: 'error',
            measured_value: 30,
            required_value: 36.0,
            approach_direction: 'hinge_pull',
          })
        );
      });

      it('should pass with correct clearances', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          hinge_side_clearance_inches: 36,
        };

        const violations = checkDoorCompliance(door);
        const hingePullViolations = violations.filter(v => v.approach_direction === 'hinge_pull');
        expect(hingePullViolations).toHaveLength(0);
      });
    });

    describe('Hinge Side Approach - Push Side', () => {
      it('should flag insufficient perpendicular clearance without closer/latch (<44 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 40,
          hinge_side_clearance_inches: 22,
          has_door_closer: false,
          has_latch: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 40,
            required_value: 44.0,
            approach_direction: 'hinge_push',
          })
        );
      });

      it('should flag insufficient perpendicular clearance with closer and latch (<48 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 45,
          hinge_side_clearance_inches: 26,
          has_door_closer: true,
          has_latch: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 45,
            required_value: 48.0,
            approach_direction: 'hinge_push',
          })
        );
      });

      it('should flag insufficient hinge side clearance without closer/latch (<22 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 44,
          hinge_side_clearance_inches: 20,
          has_door_closer: false,
          has_latch: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 20,
            required_value: 22.0,
            approach_direction: 'hinge_push',
          })
        );
      });

      it('should flag insufficient hinge side clearance with closer and latch (<26 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 48,
          hinge_side_clearance_inches: 24,
          has_door_closer: true,
          has_latch: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 24,
            required_value: 26.0,
            approach_direction: 'hinge_push',
          })
        );
      });

      it('should pass with correct clearances', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 48,
          hinge_side_clearance_inches: 26,
          has_door_closer: true,
          has_latch: true,
        };

        const violations = checkDoorCompliance(door);
        const hingePushViolations = violations.filter(v => v.approach_direction === 'hinge_push');
        expect(hingePushViolations).toHaveLength(0);
      });
    });

    describe('Latch Side Approach - Pull Side', () => {
      it('should flag insufficient perpendicular clearance (<60 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 55,
          latch_side_clearance_inches: 24,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 55,
            required_value: 60.0,
            approach_direction: 'latch_pull',
          })
        );
      });

      it('should flag insufficient latch side clearance (<24 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 20,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: 'Insufficient latch side clearance',
            severity: 'error',
            measured_value: 20,
            required_value: 24.0,
            approach_direction: 'latch_pull',
          })
        );
      });

      it('should pass with correct clearances', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          pull_side_perpendicular_clearance_inches: 60,
          latch_side_clearance_inches: 24,
        };

        const violations = checkDoorCompliance(door);
        const latchPullViolations = violations.filter(v => v.approach_direction === 'latch_pull');
        expect(latchPullViolations).toHaveLength(0);
      });
    });

    describe('Latch Side Approach - Push Side', () => {
      it('should flag insufficient perpendicular clearance without closer (<44 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 42,
          latch_side_clearance_inches: 24,
          has_door_closer: false,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 42,
            required_value: 44.0,
            approach_direction: 'latch_push',
          })
        );
      });

      it('should flag insufficient perpendicular clearance with closer (<48 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 45,
          latch_side_clearance_inches: 24,
          has_door_closer: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            measured_value: 45,
            required_value: 48.0,
            approach_direction: 'latch_push',
          })
        );
      });

      it('should flag insufficient latch side clearance (<24 inches)', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 48,
          latch_side_clearance_inches: 20,
          has_door_closer: true,
        };

        const violations = checkDoorCompliance(door);
        expect(violations).toContainEqual(
          expect.objectContaining({
            code_section: '11B-404.2.4.1',
            description: 'Insufficient latch side clearance',
            severity: 'error',
            measured_value: 20,
            required_value: 24.0,
            approach_direction: 'latch_push',
          })
        );
      });

      it('should pass with correct clearances', () => {
        const door: DoorParameters = {
          is_on_accessible_route: true,
          push_side_perpendicular_clearance_inches: 48,
          latch_side_clearance_inches: 24,
          has_door_closer: true,
        };

        const violations = checkDoorCompliance(door);
        const latchPushViolations = violations.filter(v => v.approach_direction === 'latch_push');
        expect(latchPushViolations).toHaveLength(0);
      });
    });
  });

  describe('11B-404.2.4.3 - Recessed Doors', () => {
    it('should not trigger for obstruction projecting 8 inches or less', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        obstruction_projection_beyond_door_face_inches: 8,
        obstruction_distance_from_latch_side_inches: 15,
        is_interior_doorway: true,
        pull_side_perpendicular_clearance_inches: 50,
      };

      const violations = checkDoorCompliance(door);
      const recessedViolations = violations.filter(v => v.code_section === '11B-404.2.4.3');
      expect(recessedViolations).toHaveLength(0);
    });

    it('should flag interior door with obstruction >8" within 18" of latch side', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        obstruction_projection_beyond_door_face_inches: 10,
        obstruction_distance_from_latch_side_inches: 15,
        is_interior_doorway: true,
        pull_side_perpendicular_clearance_inches: 50,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.4.3',
          description: expect.stringContaining('interior'),
          severity: 'error',
          measured_value: 50,
          required_value: 60.0,
        })
      );
    });

    it('should not flag interior door with obstruction >8" beyond 18" from latch side', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        obstruction_projection_beyond_door_face_inches: 10,
        obstruction_distance_from_latch_side_inches: 20,
        is_interior_doorway: true,
        pull_side_perpendicular_clearance_inches: 50,
      };

      const violations = checkDoorCompliance(door);
      const recessedViolations = violations.filter(v => v.code_section === '11B-404.2.4.3');
      expect(recessedViolations).toHaveLength(0);
    });

    it('should flag exterior door with obstruction >8" within 24" of latch side', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        obstruction_projection_beyond_door_face_inches: 10,
        obstruction_distance_from_latch_side_inches: 20,
        is_exterior_door: true,
        pull_side_perpendicular_clearance_inches: 50,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.4.3',
          description: expect.stringContaining('exterior'),
          severity: 'error',
          measured_value: 50,
          required_value: 60.0,
        })
      );
    });

    it('should pass recessed door with adequate forward approach clearance', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        obstruction_projection_beyond_door_face_inches: 10,
        obstruction_distance_from_latch_side_inches: 15,
        is_interior_doorway: true,
        pull_side_perpendicular_clearance_inches: 60,
      };

      const violations = checkDoorCompliance(door);
      const recessedViolations = violations.filter(v => v.code_section === '11B-404.2.4.3');
      expect(recessedViolations).toHaveLength(0);
    });
  });

  describe('11B-404.2.6 - Doors in Series', () => {
    it('should flag insufficient distance between hinged doors in series', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_in_series_with_another_door: true,
        is_hinged_door: true,
        distance_between_doors_in_series_inches: 45,
        width_of_door_swinging_into_space_between_series_inches: 0,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.6',
          description: 'Insufficient distance between doors in series',
          severity: 'error',
          measured_value: 45,
          required_value: 48.0,
        })
      );
    });

    it('should include door swing width in required distance', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_in_series_with_another_door: true,
        is_hinged_door: true,
        distance_between_doors_in_series_inches: 60,
        width_of_door_swinging_into_space_between_series_inches: 32,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.6',
          description: 'Insufficient distance between doors in series',
          severity: 'error',
          measured_value: 60,
          required_value: 80.0, // 48 + 32
        })
      );
    });

    it('should pass with adequate distance', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_in_series_with_another_door: true,
        is_hinged_door: true,
        distance_between_doors_in_series_inches: 48,
        width_of_door_swinging_into_space_between_series_inches: 0,
      };

      const violations = checkDoorCompliance(door);
      const seriesViolations = violations.filter(v => v.code_section === '11B-404.2.6');
      expect(seriesViolations).toHaveLength(0);
    });

    it('should only apply to hinged or pivoted doors', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_in_series_with_another_door: true,
        is_hinged_door: false,
        is_pivoted_door: false,
        is_sliding_door: true,
        distance_between_doors_in_series_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      const seriesViolations = violations.filter(v => v.code_section === '11B-404.2.6');
      expect(seriesViolations).toHaveLength(0);
    });
  });

  describe('11B-404.3 - Automatic Door Standards', () => {
    it('should flag automatic door not complying with ANSI/BHMA A156.10', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        is_power_assisted_door: false,
        complies_with_ANSI_BHMA_A156_10: false,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3',
          description: 'Automatic door does not comply with required standard',
          severity: 'error',
        })
      );
    });

    it('should pass automatic door complying with ANSI/BHMA A156.10', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        is_power_assisted_door: false,
        complies_with_ANSI_BHMA_A156_10: true,
      };

      const violations = checkDoorCompliance(door);
      const standardViolations = violations.filter(
        v => v.code_text === CODE_TEXT['11B-404.3_auto_standard']
      );
      expect(standardViolations).toHaveLength(0);
    });

    it('should flag power-assisted door not complying with ANSI/BHMA A156.19', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_power_assisted_door: true,
        complies_with_ANSI_BHMA_A156_19: false,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3',
          description: 'Power-assisted door does not comply with required standard',
          severity: 'error',
        })
      );
    });

    it('should pass power-assisted door complying with ANSI/BHMA A156.19', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_power_assisted_door: true,
        complies_with_ANSI_BHMA_A156_19: true,
      };

      const violations = checkDoorCompliance(door);
      const standardViolations = violations.filter(
        v => v.code_text === CODE_TEXT['11B-404.3_power_assisted_standard']
      );
      expect(standardViolations).toHaveLength(0);
    });
  });

  describe('11B-404.3.1 - Automatic Door Clear Width', () => {
    it('should flag insufficient clear opening in power-on mode', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        clear_opening_power_on_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.1',
          description: 'Insufficient clear opening in power-on mode',
          severity: 'error',
          measured_value: 30,
          required_value: 32.0,
        })
      );
    });

    it('should flag insufficient clear opening in power-off mode', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        clear_opening_power_off_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.1',
          description: 'Insufficient clear opening in power-off mode',
          severity: 'error',
          measured_value: 30,
          required_value: 32.0,
        })
      );
    });

    it('should flag insufficient clear opening at 90 degree leaf angle', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        automatic_door_leaf_angle_at_90_degrees_clear_opening_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.1',
          description: 'Insufficient clear opening with door leaf at 90 degrees',
          severity: 'error',
          measured_value: 30,
          required_value: 32.0,
        })
      );
    });

    it('should pass with 32 inches in all modes', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        clear_opening_power_on_inches: 32,
        clear_opening_power_off_inches: 32,
        automatic_door_leaf_angle_at_90_degrees_clear_opening_inches: 32,
      };

      const violations = checkDoorCompliance(door);
      const clearWidthViolations = violations.filter(v => v.code_section === '11B-404.3.1');
      expect(clearWidthViolations).toHaveLength(0);
    });
  });

  describe('11B-404.3.2 - Automatic Door Maneuvering Clearance', () => {
    it('should require maneuvering clearance for power-assisted door', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_power_assisted_door: true,
        pull_side_perpendicular_clearance_inches: 50,
        latch_side_clearance_inches: 18,
      };

      const violations = checkDoorCompliance(door);
      // Should check 11B-404.2.4 clearances
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.4.1',
          approach_direction: 'front_pull',
        })
      );
    });

    it('should require maneuvering clearance for automatic door without standby power serving egress', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: false,
        serves_accessible_means_of_egress: true,
        pull_side_perpendicular_clearance_inches: 50,
        latch_side_clearance_inches: 18,
      };

      const violations = checkDoorCompliance(door);
      // Should check 11B-404.2.4 clearances
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.4.1',
          approach_direction: 'front_pull',
        })
      );
    });

    it('should not require maneuvering clearance if door remains open in power-off', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        remains_open_in_power_off_condition: true,
        pull_side_perpendicular_clearance_inches: 30,
        latch_side_clearance_inches: 10,
      };

      const violations = checkDoorCompliance(door);
      const maneuveringViolations = violations.filter(v => v.code_section === '11B-404.2.4.1');
      expect(maneuveringViolations).toHaveLength(0);
    });

    it('should not require maneuvering clearance for automatic door with standby power', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: true,
        serves_accessible_means_of_egress: true,
        pull_side_perpendicular_clearance_inches: 30,
        latch_side_clearance_inches: 10,
      };

      const violations = checkDoorCompliance(door);
      const maneuveringViolations = violations.filter(v => v.code_section === '11B-404.2.4.1');
      expect(maneuveringViolations).toHaveLength(0);
    });
  });

  describe('11B-404.3.6 - Break Out Opening', () => {
    it('should flag insufficient break out opening in emergency mode', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: false,
        is_part_of_means_of_egress: true,
        has_manual_swinging_door_serving_same_egress: false,
        clear_break_out_opening_emergency_mode_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.6',
          description: 'Insufficient clear break out opening in emergency mode',
          severity: 'error',
          measured_value: 30,
          required_value: 32.0,
        })
      );
    });

    it('should pass with 32 inches break out opening', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: false,
        is_part_of_means_of_egress: true,
        has_manual_swinging_door_serving_same_egress: false,
        clear_break_out_opening_emergency_mode_inches: 32,
      };

      const violations = checkDoorCompliance(door);
      const breakOutViolations = violations.filter(v => v.code_section === '11B-404.3.6');
      expect(breakOutViolations).toHaveLength(0);
    });

    it('should not require break out opening if door has standby power', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: true,
        is_part_of_means_of_egress: true,
        clear_break_out_opening_emergency_mode_inches: 20,
      };

      const violations = checkDoorCompliance(door);
      const breakOutViolations = violations.filter(v => v.code_section === '11B-404.3.6');
      expect(breakOutViolations).toHaveLength(0);
    });

    it('should not require break out opening if not part of means of egress', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: false,
        is_part_of_means_of_egress: false,
        clear_break_out_opening_emergency_mode_inches: 20,
      };

      const violations = checkDoorCompliance(door);
      const breakOutViolations = violations.filter(v => v.code_section === '11B-404.3.6');
      expect(breakOutViolations).toHaveLength(0);
    });

    it('should not require break out opening if manual swinging door serves same egress', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        has_standby_power: false,
        is_part_of_means_of_egress: true,
        has_manual_swinging_door_serving_same_egress: true,
        clear_break_out_opening_emergency_mode_inches: 20,
      };

      const violations = checkDoorCompliance(door);
      const breakOutViolations = violations.filter(v => v.code_section === '11B-404.3.6');
      expect(breakOutViolations).toHaveLength(0);
    });
  });

  describe('11B-404.3.7 - Revolving Doors, Gates and Turnstiles (Automatic)', () => {
    it('should flag automatic revolving door on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_revolving_door: true,
        is_automatic_door: true,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.7',
          description: 'Revolving door is not permitted on accessible route',
          severity: 'error',
        })
      );
    });

    it('should flag power-assisted revolving gate on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_revolving_gate: true,
        is_power_assisted_door: true,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.7',
          description: 'Revolving gate is not permitted on accessible route',
          severity: 'error',
        })
      );
    });

    it('should flag automatic turnstile on accessible route', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_turnstile: true,
        is_automatic_door: true,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.3.7',
          description: 'Turnstile is not permitted on accessible route',
          severity: 'error',
        })
      );
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple violations for same door', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: 30, // Violation: < 32"
        pull_side_perpendicular_clearance_inches: 50, // Violation: < 60"
        latch_side_clearance_inches: 15, // Violation: < 18"
        projections: [
          { height_above_floor_inches: 30, depth_into_opening_inches: 2 }, // Violation: below 34"
        ],
      };

      const violations = checkDoorCompliance(door);
      expect(violations.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle door with all compliant measurements', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: 36,
        pull_side_perpendicular_clearance_inches: 60,
        push_side_perpendicular_clearance_inches: 48,
        latch_side_clearance_inches: 24,
        hinge_side_clearance_inches: 36,
        has_door_closer: false,
        has_latch: false,
        is_exterior_door: false,
        projections: [],
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toHaveLength(0);
    });

    it('should handle automatic door with all compliant measurements', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_automatic_door: true,
        is_power_assisted_door: false,
        complies_with_ANSI_BHMA_A156_10: true,
        clear_opening_power_on_inches: 36,
        clear_opening_power_off_inches: 36,
        automatic_door_leaf_angle_at_90_degrees_clear_opening_inches: 36,
        remains_open_in_power_off_condition: true,
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle null/undefined measurements gracefully', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: null,
        pull_side_perpendicular_clearance_inches: undefined,
      };

      const violations = checkDoorCompliance(door);
      // Should not throw, and should not flag violations for missing measurements
      const clearWidthViolations = violations.filter(
        v => v.code_text === CODE_TEXT['11B-404.2.3_clear_width']
      );
      expect(clearWidthViolations).toHaveLength(0);
    });

    it('should handle door with no projections array', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: 32,
        projections: undefined,
      };

      const violations = checkDoorCompliance(door);
      const projectionViolations = violations.filter(v => v.description.includes('Projection'));
      expect(projectionViolations).toHaveLength(0);
    });

    it('should handle door that is both sliding and folding (special case)', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        is_sliding_door: true,
        is_folding_door: true,
        doorway_width_inches: 30,
      };

      const violations = checkDoorCompliance(door);
      // Should use special door maneuvering clearance check
      expect(violations).toBeDefined();
    });

    it('should handle boundary values correctly', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: 32.0, // Exactly at limit
        projections: [
          { height_above_floor_inches: 34.0, depth_into_opening_inches: 4.0 }, // Exactly at limits
        ],
      };

      const violations = checkDoorCompliance(door);
      // Should pass all checks - boundary values should be acceptable
      const clearWidthViolations = violations.filter(
        v => v.code_text === CODE_TEXT['11B-404.2.3_clear_width']
      );
      const projectionViolations = violations.filter(
        v => v.code_text === CODE_TEXT['11B-404.2.3_projections_34_to_80']
      );
      expect(clearWidthViolations).toHaveLength(0);
      expect(projectionViolations).toHaveLength(0);
    });

    it('should handle very small violations (precision testing)', () => {
      const door: DoorParameters = {
        is_on_accessible_route: true,
        clear_width_inches: 31.99, // Just below 32"
      };

      const violations = checkDoorCompliance(door);
      expect(violations).toContainEqual(
        expect.objectContaining({
          code_section: '11B-404.2.3',
          measured_value: 31.99,
          required_value: 32.0,
        })
      );
    });
  });
});

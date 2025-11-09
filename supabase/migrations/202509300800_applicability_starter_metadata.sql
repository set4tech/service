-- Starter metadata for high-value CBC 11A/11B sections
-- This provides initial applicability rules for common sections to demonstrate filtering
-- Expand incrementally as you author more metadata

-- ============================================================================
-- 1) Always include scoping/definitions/administrative sections
-- ============================================================================

-- Mark scoping and administrative sections as always_include
UPDATE sections
SET always_include = TRUE
WHERE chapter IN ('11A', '11B')
  AND (
    title ILIKE '%scope%'
    OR title ILIKE '%application%'
    OR title ILIKE '%definitions%'
    OR title ILIKE '%referenced%'
    OR title ILIKE '%administration%'
    OR title ILIKE '%general%'
    -- Section 101-104 typically covers scope, definitions, etc.
    OR number ~ '^11[AB]-10[1-4]'
  );

-- ============================================================================
-- 2) Parking-specific sections (11B-208.*)
-- ============================================================================

-- Parking spaces and related provisions only apply if site has parking
UPDATE sections
SET
  requires_parking = TRUE,
  applicable_work_types = ARRAY['New Construction', 'Addition', 'Alteration/Renovation', 'Change of Occupancy'],
  applicability_notes = 'Parking requirements apply only to projects with parking facilities'
WHERE chapter = '11B'
  AND number LIKE '11B-208%';

-- ============================================================================
-- 3) Elevator-dependent sections
-- ============================================================================

-- Sections mentioning elevators in title are likely elevator-dependent
UPDATE sections
SET
  requires_elevator = TRUE,
  applicability_notes = 'Applies only when elevator is required or present (not exempt per ≤3 stories or ≤3000 sf/story)'
WHERE chapter IN ('11A', '11B')
  AND (
    title ILIKE '%elevator%'
    OR title ILIKE '%lift%'
  );

-- ============================================================================
-- 4) Employee work areas (Alteration-specific)
-- ============================================================================

-- 11B-206.2.3 Employee Work Areas - primarily for alterations
UPDATE sections
SET
  applicable_work_types = ARRAY['Alteration/Renovation', 'Change of Occupancy'],
  applicability_notes = 'Employee work area requirements specific to alterations'
WHERE chapter = '11B'
  AND number = '11B-206.2.3';

-- ============================================================================
-- 5) Large building thresholds
-- ============================================================================

-- Example: Sections that apply to buildings over 5,000 sf per story
-- (You'll need to identify these from code text analysis)
-- UPDATE sections
-- SET
--   min_building_size = 5000,
--   applicability_notes = 'Applies to buildings with gross floor area > 5,000 sf per story'
-- WHERE chapter IN ('11A', '11B')
--   AND number IN ('11B-xxx.x', '11A-yyy.y');  -- replace with actual section numbers

-- ============================================================================
-- 6) Occupancy-specific sections
-- ============================================================================

-- Example: Mark sections that only apply to specific occupancies
-- Assembly (A), Business (B), Educational (E), etc.
-- UPDATE sections
-- SET
--   applicable_occupancies = ARRAY['A'],
--   applicability_notes = 'Assembly occupancy specific requirements'
-- WHERE chapter = '11B'
--   AND number LIKE '11B-221%';  -- Assembly areas section

-- ============================================================================
-- 7) Residential-specific sections (11A focus)
-- ============================================================================

-- 11A sections generally apply to residential (R) occupancies
-- but are unrestricted unless specifically marked
UPDATE sections
SET applicability_notes = '11A chapter applies to residential facilities (FHA)'
WHERE chapter = '11A'
  AND applicability_notes IS NULL;

-- ============================================================================
-- 8) Comments
-- ============================================================================

COMMENT ON COLUMN sections.always_include IS 'Set TRUE for scoping, definitions, admin sections that should always be included regardless of project variables';

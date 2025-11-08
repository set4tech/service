-- Fix duplicate checks in the checks table
-- This migration:
-- 1. Removes duplicate section-based checks (keeping the oldest)
-- 2. Removes duplicate element-based checks (keeping the oldest)
-- 3. Adds unique constraints to prevent future duplicates

-- Step 1: Delete duplicate section-based checks (where element_group_id IS NULL)
-- Keep only the oldest check (by id, using uuid ordering as proxy for creation time)
WITH duplicates AS (
  SELECT
    c.id,
    c.assessment_id,
    c.section_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.assessment_id, c.section_id
      ORDER BY c.id -- UUIDs are v4, use id as stable ordering
    ) as rn
  FROM checks c
  WHERE c.element_group_id IS NULL
)
DELETE FROM checks
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Delete duplicate element-based checks
-- Keep only the oldest check per (assessment, section, element_group, element_instance)
WITH element_duplicates AS (
  SELECT
    c.id,
    c.assessment_id,
    c.section_id,
    c.element_group_id,
    COALESCE(c.element_instance_id::text, 'null') as instance_key,
    ROW_NUMBER() OVER (
      PARTITION BY c.assessment_id, c.section_id, c.element_group_id, c.element_instance_id
      ORDER BY c.id
    ) as rn
  FROM checks c
  WHERE c.element_group_id IS NOT NULL
)
DELETE FROM checks
WHERE id IN (
  SELECT id FROM element_duplicates WHERE rn > 1
);

-- Step 3: Add unique constraints to prevent future duplicates

-- For section-based checks: unique on (assessment_id, section_id) where no element_group
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_checks_unique_section_based
ON checks (assessment_id, section_id)
WHERE element_group_id IS NULL;

-- For element-based checks: unique on (assessment_id, section_id, element_group_id, element_instance_id)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_checks_unique_element_based
ON checks (assessment_id, section_id, element_group_id, COALESCE(element_instance_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE element_group_id IS NOT NULL;

-- Log the results
DO $$
DECLARE
  section_count INTEGER;
  element_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO section_count FROM checks WHERE element_group_id IS NULL;
  SELECT COUNT(*) INTO element_count FROM checks WHERE element_group_id IS NOT NULL;

  RAISE NOTICE 'Migration complete. Section-based checks: %, Element-based checks: %', section_count, element_count;
END $$;

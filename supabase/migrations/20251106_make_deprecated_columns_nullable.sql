-- Make deprecated columns nullable for new element_instance pattern
-- New checks use section_id and element_instance_id instead

-- Make code_section_key nullable (was NOT NULL)
ALTER TABLE checks ALTER COLUMN code_section_key DROP NOT NULL;

-- Make code_section_number nullable (if NOT NULL)
ALTER TABLE checks ALTER COLUMN code_section_number DROP NOT NULL;

-- Make code_section_title nullable (if NOT NULL)
ALTER TABLE checks ALTER COLUMN code_section_title DROP NOT NULL;

COMMENT ON COLUMN checks.code_section_key IS 'DEPRECATED: Use section_id FK instead. Kept for backwards compatibility with old checks.';
COMMENT ON COLUMN checks.code_section_number IS 'DEPRECATED: Denormalized data. Use section_id FK to sections table instead.';
COMMENT ON COLUMN checks.code_section_title IS 'DEPRECATED: Denormalized data. Use section_id FK to sections table instead.';
COMMENT ON COLUMN checks.instance_label IS 'DEPRECATED: Use element_instance_id FK instead. Kept for backwards compatibility with old checks.';
COMMENT ON COLUMN checks.element_group_id IS 'DEPRECATED: Use element_instance_id FK to get element group. Kept for backwards compatibility.';


-- Make deprecated columns nullable for new element_instance pattern
-- New checks use section_id FK and element_instance_id FK instead

-- Make code_section_key nullable (replaced by section_id FK)
ALTER TABLE checks ALTER COLUMN code_section_key DROP NOT NULL;

COMMENT ON COLUMN checks.code_section_key IS 'DEPRECATED: Use section_id FK instead. Kept for backwards compatibility with old checks.';
COMMENT ON COLUMN checks.code_section_number IS 'Denormalized section number for display and sorting. Populated from sections.number via section_id FK.';
COMMENT ON COLUMN checks.code_section_title IS 'Denormalized section title for display. Populated from sections.title via section_id FK.';
COMMENT ON COLUMN checks.instance_label IS 'DEPRECATED: Use element_instance_id FK instead. Kept for backwards compatibility with old checks.';
COMMENT ON COLUMN checks.element_group_id IS 'DEPRECATED: Use element_instance_id FK to get element group. Kept for backwards compatibility.';


-- Rename table to match what the code expects
-- The code references 'element_section_mappings' but the table is named 'element_group_section_mappings'

ALTER TABLE IF EXISTS element_group_section_mappings
RENAME TO element_section_mappings;

-- Update any indexes that reference the old table name
ALTER INDEX IF EXISTS element_group_section_mappings_pkey
RENAME TO element_section_mappings_pkey;

ALTER INDEX IF EXISTS idx_element_group_section_mappings_element
RENAME TO idx_element_section_mappings_element;

ALTER INDEX IF EXISTS idx_element_group_section_mappings_section
RENAME TO idx_element_section_mappings_section;

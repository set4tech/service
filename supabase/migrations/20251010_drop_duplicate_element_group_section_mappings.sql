-- Drop duplicate element_group_section_mappings table
-- This table was accidentally created in migration 20251008_create_element_section_mappings.sql
-- It duplicates the functionality of element_section_mappings (created Oct 1)
-- All application code uses element_section_mappings, not element_group_section_mappings
-- Data: element_section_mappings has 169 rows, element_group_section_mappings has only 90 (incomplete/stale)

DROP TABLE IF EXISTS element_group_section_mappings CASCADE;

COMMENT ON TABLE element_section_mappings IS 'Maps which code sections apply to each element group (e.g., Doors -> [11B-404.2.6, 11B-404.2.7]). This is the canonical mapping table.';

-- Drop the deprecated code_section_key column from checks table
-- The section key is now accessed via JOIN with sections table using section_id foreign key

-- This eliminates data redundancy and ensures consistency
-- API endpoints now JOIN with sections table to get the key when needed

ALTER TABLE checks DROP COLUMN IF EXISTS code_section_key;


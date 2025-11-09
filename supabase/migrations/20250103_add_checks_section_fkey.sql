-- Add foreign key constraint from checks.code_section_key to sections.key
ALTER TABLE checks
ADD CONSTRAINT checks_code_section_key_fkey
FOREIGN KEY (code_section_key)
REFERENCES sections(key)
ON DELETE RESTRICT;

-- Add index to improve join performance (if not already exists)
CREATE INDEX IF NOT EXISTS idx_checks_code_section_key ON checks(code_section_key);

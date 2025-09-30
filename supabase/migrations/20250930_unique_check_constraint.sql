-- Prevent duplicate checks for the same section in an assessment
ALTER TABLE checks
ADD CONSTRAINT unique_check_per_section
UNIQUE (assessment_id, code_section_number);

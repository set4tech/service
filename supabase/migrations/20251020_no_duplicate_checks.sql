ALTER TABLE checks 
ADD CONSTRAINT unique_check_instance UNIQUE (assessment_id, code_section_key, instance_label);
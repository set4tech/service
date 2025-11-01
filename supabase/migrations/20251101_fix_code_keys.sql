-- Add new UUID column to sections with generated values
ALTER TABLE public.sections 
ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

-- Update any NULL values (shouldn't be any with the default, but to be safe)
UPDATE public.sections 
SET id_new = gen_random_uuid() 
WHERE id_new IS NULL;

-- Drop the old primary key constraint
ALTER TABLE public.sections 
DROP CONSTRAINT sections_pkey;

-- Drop the old serial id column and its sequence
DROP SEQUENCE IF EXISTS sections_id_seq CASCADE;
ALTER TABLE public.sections 
DROP COLUMN id;

-- Rename the new UUID column to id
ALTER TABLE public.sections 
RENAME COLUMN id_new TO id;

-- Make it NOT NULL
ALTER TABLE public.sections 
ALTER COLUMN id SET NOT NULL;

-- Add the new primary key constraint
ALTER TABLE public.sections 
ADD CONSTRAINT sections_pkey PRIMARY KEY (id);

-- Add section_id to checks table
ALTER TABLE public.checks 
ADD COLUMN section_id UUID;

-- Populate section_id from code_section_key
UPDATE public.checks 
SET section_id = sections.id 
FROM public.sections 
WHERE checks.code_section_key = sections.key;

-- Make it NOT NULL (assuming all checks have valid code_section_key)
ALTER TABLE public.checks 
ALTER COLUMN section_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE public.checks 
ADD CONSTRAINT checks_section_id_fkey 
FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

-- Add index for section_id
CREATE INDEX idx_checks_section_id 
ON public.checks USING btree (section_id);

-- Add composite index to replace idx_assessment_section
CREATE INDEX idx_checks_assessment_section_id 
ON public.checks USING btree (assessment_id, section_id);

-- Add section_id to element_section_mappings table
ALTER TABLE public.element_section_mappings 
ADD COLUMN section_id UUID;

-- Populate section_id from section_key
UPDATE public.element_section_mappings 
SET section_id = sections.id 
FROM public.sections 
WHERE element_section_mappings.section_key = sections.key;

-- Make it NOT NULL
ALTER TABLE public.element_section_mappings 
ALTER COLUMN section_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE public.element_section_mappings 
ADD CONSTRAINT element_section_mappings_section_id_fkey 
FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;

-- Add index for section_id
CREATE INDEX idx_element_section_mappings_section_id 
ON public.element_section_mappings USING btree (section_id);

-- Add unique indexes using section_id instead of section_key
CREATE UNIQUE INDEX element_section_mappings_global_unique_id 
ON public.element_section_mappings USING btree (element_group_id, section_id) 
WHERE (assessment_id IS NULL);

CREATE UNIQUE INDEX element_section_mappings_assessment_unique_id 
ON public.element_section_mappings USING btree (element_group_id, section_id, assessment_id) 
WHERE (assessment_id IS NOT NULL);

-- Add section_id columns to section_references table
ALTER TABLE public.section_references 
ADD COLUMN source_section_id UUID;

ALTER TABLE public.section_references 
ADD COLUMN target_section_id UUID;

-- Populate from existing keys
UPDATE public.section_references 
SET source_section_id = s.id 
FROM public.sections s 
WHERE section_references.source_section_key = s.key;

UPDATE public.section_references 
SET target_section_id = s.id 
FROM public.sections s 
WHERE section_references.target_section_key = s.key;

-- Make NOT NULL and add foreign keys
ALTER TABLE public.section_references 
ALTER COLUMN source_section_id SET NOT NULL;

ALTER TABLE public.section_references 
ALTER COLUMN target_section_id SET NOT NULL;

ALTER TABLE public.section_references 
ADD CONSTRAINT section_references_source_fkey 
FOREIGN KEY (source_section_id) REFERENCES sections(id) ON DELETE CASCADE;

ALTER TABLE public.section_references 
ADD CONSTRAINT section_references_target_fkey 
FOREIGN KEY (target_section_id) REFERENCES sections(id) ON DELETE CASCADE;

-- Add indexes
CREATE INDEX idx_section_refs_source_id ON section_references(source_section_id);
CREATE INDEX idx_section_refs_target_id ON section_references(target_section_id);

-- Add unique constraint using new columns
CREATE UNIQUE INDEX section_references_unique_id 
ON section_references(source_section_id, target_section_id);
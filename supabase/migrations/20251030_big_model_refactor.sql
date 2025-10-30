-- Drop the foreign key constraint from sections to codes
ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_code_id_fkey;

-- Drop the unique constraint temporarily
ALTER TABLE sections DROP CONSTRAINT IF EXISTS unique_section_number_per_code;

-- Drop columns from codes
ALTER TABLE codes DROP COLUMN IF EXISTS provider;
ALTER TABLE codes DROP COLUMN IF EXISTS source_id; 
-- ALTER TABLE codes RENAME COLUMN  version TO year;


-- -- Insert the new code
-- INSERT INTO codes (id, year, jurisdiction, title, source_url)
-- VALUES (
--   'CBC',
--   2025,
--   'California',
--   'California Building Code',
--   'https://codes.iccsafe.org/content/CABC2025P1'
-- );

-- Update sections to reference the new code id
UPDATE sections SET code_id = 'CBC';

-- Delete duplicate sections keeping only the first occurrence of each number
DELETE FROM sections
WHERE id NOT IN (
  SELECT MIN(id)
  FROM sections
  GROUP BY number
);

-- Re-add the unique constraint
ALTER TABLE sections ADD CONSTRAINT  unique_section_number_per_code UNIQUE (code_id, number);

-- Create chapters table
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id TEXT NOT NULL,
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  url TEXT NOT NULL,
  UNIQUE (code_id, number),
  FOREIGN KEY (code_id) REFERENCES codes(id)
);

-- Insert chapters
INSERT INTO chapters (name, number, code_id, url)
VALUES 
('Means of Egress', '10', 'CBC', 'https://codes.iccsafe.org/content/CABC2025P1/chapter-10-means-of-egress'),
('Housing Accessibility', '11a', 'CBC', 'https://codes.iccsafe.org/content/CABC2025P1/chapter-11a-housing-accessibility'),
('Accessibility to Public Buildings', '11b', 'CBC', 'https://codes.iccsafe.org/content/CABC2025P1/chapter-11b-accessibility-to-public-buildings-public-accommodations-commercial-buildings-and-public-housing');

-- Add chapter_id column to sections
ALTER TABLE sections ADD COLUMN chapter_id UUID REFERENCES chapters(id);

-- Update sections with their chapter assignments
UPDATE sections 
SET chapter_id = c.id
FROM chapters c 
WHERE sections.number LIKE '11B-%'
AND c.number = '11b';

UPDATE sections 
SET chapter_id = c.id
FROM chapters c 
WHERE sections.number LIKE '11%'
AND sections.number LIKE '%A%'
AND c.number = '11a';

UPDATE sections 
SET chapter_id = c.id
FROM chapters c 
WHERE sections.number LIKE '10%'
AND c.number = '10';

-- Make chapter_id required after populating it
ALTER TABLE sections ALTER COLUMN chapter_id SET NOT NULL;

-- Drop unused columns from checks
ALTER TABLE checks DROP COLUMN check_type;
ALTER TABLE checks DROP COLUMN actual_prompt_used;

DELETE FROM code where id != 'CBC'
-- Add Walls element group for building code compliance checking
-- Walls include interior/exterior walls, partitions, wall-mounted elements, and protective surfaces

INSERT INTO element_groups (name, slug, description, icon, sort_order) 
VALUES ('Walls', 'walls', 'Interior and exterior wall compliance including protruding objects and wall-mounted elements', 'square', 12);

COMMENT ON TABLE element_groups IS 'Element categories including: doors, bathrooms, kitchens, exit-signage, assisted-listening, elevators, elevator-signage, parking-signage, ramps, changes-in-level, turning-spaces, walls';


-- Add additional element groups for comprehensive compliance checking

INSERT INTO element_groups (name, slug, description, icon, sort_order) VALUES
  ('Exit Signage', 'exit-signage', 'Exit and egress signage compliance', 'sign', 4),
  ('Assisted Listening', 'assisted-listening', 'Assistive listening systems and devices', 'headphones', 5),
  ('Elevators', 'elevators', 'Elevator car and equipment compliance', 'building', 6),
  ('Elevator Signage', 'elevator-signage', 'Elevator signage and indicators', 'info', 7),
  ('Parking Signage', 'parking-signage', 'Parking and loading zone signage', 'parking', 8),
  ('Ramps', 'ramps', 'Ramp slope, surface, and handrail compliance', 'triangle', 9),
  ('Changes in Level', 'changes-in-level', 'Level changes and transitions compliance', 'layers', 10),
  ('Turning Spaces', 'turning-spaces', 'Wheelchair turning space and maneuvering clearance', 'maximize', 11);

COMMENT ON TABLE element_groups IS 'Element categories including: doors, bathrooms, kitchens, exit-signage, assisted-listening, elevators, elevator-signage, parking-signage, ramps, changes-in-level, turning-spaces';

-- When an element instance is deleted, also delete its screenshots
-- Currently: deletes assignments but leaves orphaned screenshots
-- New behavior: deletes screenshots too (clears the ghost blue boxes)

-- Create a trigger function that deletes screenshots when all their assignments are gone
CREATE OR REPLACE FUNCTION delete_orphaned_screenshots()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete screenshots that have no remaining assignments
  DELETE FROM screenshots
  WHERE id = OLD.screenshot_id
    AND NOT EXISTS (
      SELECT 1 FROM screenshot_element_instance_assignments
      WHERE screenshot_id = OLD.screenshot_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM screenshot_check_assignments
      WHERE screenshot_id = OLD.screenshot_id
    );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger on screenshot_element_instance_assignments deletion
CREATE TRIGGER trigger_delete_orphaned_screenshots_element
AFTER DELETE ON screenshot_element_instance_assignments
FOR EACH ROW
EXECUTE FUNCTION delete_orphaned_screenshots();

-- Trigger on screenshot_check_assignments deletion (for completeness)
CREATE TRIGGER trigger_delete_orphaned_screenshots_check
AFTER DELETE ON screenshot_check_assignments
FOR EACH ROW
EXECUTE FUNCTION delete_orphaned_screenshots();

COMMENT ON FUNCTION delete_orphaned_screenshots() IS
  'Deletes screenshots when they have no remaining assignments to element instances or checks. Cleans up ghost bounding box indicators.';

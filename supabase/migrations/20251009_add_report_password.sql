-- Add report_password column to projects table for customer report access
ALTER TABLE projects
ADD COLUMN report_password TEXT;

COMMENT ON COLUMN projects.report_password IS 'Bcrypt-hashed password for customer report access (publicly accessible)';

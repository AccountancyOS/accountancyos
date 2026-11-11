-- Drop the old constraint first
ALTER TABLE templates DROP CONSTRAINT templates_status_check;

-- Update existing templates to use new status values
UPDATE templates SET status = 'inactive' WHERE status IN ('draft', 'deprecated');
-- Status 'active' can stay as is

-- Add the new constraint
ALTER TABLE templates ADD CONSTRAINT templates_status_check 
CHECK (status = ANY (ARRAY['inactive'::text, 'active'::text]));
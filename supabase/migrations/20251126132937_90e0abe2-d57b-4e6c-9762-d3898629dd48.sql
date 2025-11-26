-- Add 'questionnaire' to the allowed template types
ALTER TABLE templates DROP CONSTRAINT templates_type_check;

ALTER TABLE templates ADD CONSTRAINT templates_type_check 
CHECK (type = ANY (ARRAY['workpaper'::text, 'email'::text, 'job'::text, 'task'::text, 'checklist'::text, 'automation'::text, 'questionnaire'::text]));
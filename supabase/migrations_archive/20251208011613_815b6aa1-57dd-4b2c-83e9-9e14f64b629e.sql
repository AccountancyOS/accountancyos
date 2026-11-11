-- Add missing columns to job_templates table for full template engine support
ALTER TABLE public.job_templates
ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'one_off',
ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS relative_due_offset integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS ui_category text DEFAULT 'General',
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS trigger_conditions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS entity_filters jsonb,
ADD COLUMN IF NOT EXISTS records_requests_template jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS skip_if_no_activity boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_close_if_no_work boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS description text;

-- Add missing columns to template_versions table
ALTER TABLE public.template_versions
ADD COLUMN IF NOT EXISTS version integer,
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

-- Add missing columns to jobs table for template engine
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS template_version integer,
ADD COLUMN IF NOT EXISTS generation_reason text,
ADD COLUMN IF NOT EXISTS auto_generated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS can_undo_until timestamp with time zone;

-- Update any existing rows to use job_name as name fallback
UPDATE public.jobs SET name = job_name WHERE name IS NULL;
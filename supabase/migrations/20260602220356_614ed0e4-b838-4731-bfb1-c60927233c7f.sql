ALTER TABLE public.template_merge_fields
  ADD COLUMN IF NOT EXISTS template_types text[] NOT NULL DEFAULT '{all}';

CREATE INDEX IF NOT EXISTS idx_template_merge_fields_template_types
  ON public.template_merge_fields USING GIN (template_types);
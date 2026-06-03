
-- Add xlsx file columns to workpaper_templates
ALTER TABLE public.workpaper_templates
  ADD COLUMN IF NOT EXISTS template_format text NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS sheet_names text[];

-- Add xlsx file columns to job_workpaper_instances
ALTER TABLE public.job_workpaper_instances
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS file_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_uploaded_by uuid;

-- Storage RLS for workpaper-files bucket: path is {kind}/{org_id}/...
-- Members of the org (via organization_users) can read/write their org's files.

CREATE POLICY "workpaper_files_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workpaper-files'
    AND EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id::text = split_part(name, '/', 2)
    )
  );

CREATE POLICY "workpaper_files_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workpaper-files'
    AND EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id::text = split_part(name, '/', 2)
    )
  );

CREATE POLICY "workpaper_files_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workpaper-files'
    AND EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id::text = split_part(name, '/', 2)
    )
  );

CREATE POLICY "workpaper_files_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workpaper-files'
    AND EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id::text = split_part(name, '/', 2)
    )
  );

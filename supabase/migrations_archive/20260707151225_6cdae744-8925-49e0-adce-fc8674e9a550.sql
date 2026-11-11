DROP POLICY IF EXISTS "Portal clients can upload job document files" ON storage.objects;
CREATE POLICY "Portal clients can upload job document files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-documents'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = NULLIF((storage.foldername(name))[2], '')::uuid
      AND public.client_has_portal_access(auth.uid(), j.client_id, j.company_id)
  )
);
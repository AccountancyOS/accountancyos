-- ============================================================
-- FUN-5 (deferred sub-part): let portal clients upload job-document FILES
-- ============================================================
-- The job_documents TABLE already has a portal INSERT policy ("Portal clients can upload job
-- documents"), but the job-documents STORAGE bucket only had org-member INSERT policies, so a
-- portal client's file upload would be RLS-rejected. This adds the matching storage INSERT
-- policy, gated the same way as the table policy: the caller must have portal access to the
-- job the file is being attached to.
--
-- Path is `${organization_id}/${job_id}/${file}` (document-service), so foldername[2] = job_id.
-- ============================================================

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

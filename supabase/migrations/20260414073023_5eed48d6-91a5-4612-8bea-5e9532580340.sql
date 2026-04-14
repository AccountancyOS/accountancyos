
-- =====================================================
-- 1. Create the job-documents storage bucket
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('job-documents', 'job-documents', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 2. Org-scoped storage policies for job-documents
--    Path convention: {org_id}/{job_id}/{timestamp}_{filename}
--    First folder segment = org_id, enforced via organization_users
-- =====================================================

-- SELECT: org members can read their org's documents
CREATE POLICY "Org members can read job documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'job-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- INSERT: org members can upload to their org's folder
CREATE POLICY "Org members can upload job documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'job-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- DELETE: org members can delete from their org's folder
CREATE POLICY "Org members can delete job documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'job-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- =====================================================
-- 3. Trigger to block deletion of signed documents
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_signed_document_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete a signed document (id: %). Signed documents must be retained for compliance.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_signed_document_deletion
BEFORE DELETE ON public.job_documents
FOR EACH ROW
EXECUTE FUNCTION public.prevent_signed_document_deletion();

-- =====================================================
-- 4. Drop orphaned client-documents storage policies
-- =====================================================
DROP POLICY IF EXISTS "Org members can read client documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload client documents" ON storage.objects;

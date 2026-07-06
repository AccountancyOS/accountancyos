DROP POLICY IF EXISTS "Portal clients can upload receipt files" ON storage.objects;
CREATE POLICY "Portal clients can upload receipt files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND public.portal_has_perm(
    CASE WHEN (storage.foldername(name))[2] = 'client'  THEN NULLIF((storage.foldername(name))[3], '')::uuid END,
    CASE WHEN (storage.foldername(name))[2] = 'company' THEN NULLIF((storage.foldername(name))[3], '')::uuid END,
    'allow_receipt_upload'
  )
);
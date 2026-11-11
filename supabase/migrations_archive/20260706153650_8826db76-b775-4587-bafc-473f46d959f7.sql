-- ============================================================
-- FUN-5 / Audit Fix (portal actions): let portal clients upload receipt FILES
-- ============================================================
-- The receipts storage bucket only had org-member INSERT policies, so a portal client uploading
-- a receipt (ReceiptsTab -> storage.upload) was rejected by RLS with "Failed to upload receipt"
-- even though allow_receipt_upload was granted and the receipts *table* already has a portal
-- INSERT policy. A portal SELECT policy on the bucket already exists (20260630161043); this adds
-- the missing INSERT.
--
-- The file path is `${organization_id}/${entity_type}/${entity_id}/${file}` (ReceiptsTab), and
-- the storage row is written BEFORE the receipts table row, so we gate on the PATH (not a join
-- to receipts, which doesn't exist yet). portal_has_perm reads auth.uid() — storage RLS runs as
-- the portal user, so that resolves correctly.
-- ============================================================

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

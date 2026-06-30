-- ============================================================
-- Portal documents — let portal users download their receipt files
-- ============================================================
-- The portal Documents page now lists receipts (portalDocumentsService.loadReceipts),
-- but the 'receipts' storage bucket only had org-member read policies, so a portal user
-- could see a receipt in the list yet fail to download it. This adds a storage SELECT
-- policy scoped via the receipts table (object name = receipts.file_path) using the same
-- portal access checks as the receipts table policy. No path-format assumptions.
-- ============================================================

DROP POLICY IF EXISTS "Portal clients can view their receipt files" ON storage.objects;
CREATE POLICY "Portal clients can view their receipt files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.file_path = storage.objects.name
      AND (
        public.portal_has_perm(r.client_id, r.company_id, 'allow_receipt_upload')
        OR public.portal_can_access_bookkeeping(r.client_id, r.company_id)
      )
  )
);

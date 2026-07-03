CREATE POLICY "Org members can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.organization_users ou ON ou.organization_id = i.organization_id
    WHERE ou.user_id = auth.uid()
      AND (storage.foldername(name))[1] = i.id::text
  )
);

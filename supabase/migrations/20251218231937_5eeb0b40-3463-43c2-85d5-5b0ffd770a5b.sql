-- Phase 6: Storage Bucket Security Migration
-- Add org-scoped access controls to filing-documents bucket

-- First, drop existing overly permissive policies on storage.objects for filing-documents
DROP POLICY IF EXISTS "Authenticated users can upload filing documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read filing documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read filing documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload filing documents" ON storage.objects;

-- Create org-scoped policies for filing-documents bucket
-- Path structure: {organization_id}/filings/{filing_id}/{filename}

-- Allow authenticated users to read files in their organization's folder
CREATE POLICY "Org members can read filing documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'filing-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Allow authenticated users to upload files to their organization's folder
CREATE POLICY "Org members can upload filing documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'filing-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Allow authenticated users to update files in their organization's folder
CREATE POLICY "Org members can update filing documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'filing-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Allow authenticated users to delete files in their organization's folder (admin/owner only)
CREATE POLICY "Org admins can delete filing documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'filing-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
    AND ou.role IN ('owner', 'admin')
  )
);

-- Make filing-documents bucket private if it exists
UPDATE storage.buckets 
SET public = false 
WHERE id = 'filing-documents';

-- Add similar policies for client-documents bucket if it exists
DROP POLICY IF EXISTS "Authenticated users can upload client documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read client documents" ON storage.objects;

CREATE POLICY "Org members can read client documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Org members can upload client documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.organization_id::text = (storage.foldername(name))[1]
  )
);
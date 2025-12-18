-- Task 5: Create rate limiting table
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup and lookups
CREATE INDEX idx_rate_limits_window ON public.api_rate_limits(window_start);
CREATE INDEX idx_rate_limits_key ON public.api_rate_limits(key);

-- RLS - only service role can access (edge functions)
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for regular users - only service role can access

-- Auto-cleanup function for old rate limit entries
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;

-- Comment
COMMENT ON TABLE public.api_rate_limits IS 'Rate limiting for API endpoints. Entries auto-expire after 1 hour.';

-- Task 6: Fix questionnaire-files storage policies
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload questionnaire files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read questionnaire files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view questionnaire files in their organization" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload questionnaire files in their organization" ON storage.objects;
DROP POLICY IF EXISTS "Users can update questionnaire files in their organization" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete questionnaire files in their organization" ON storage.objects;

-- Create secure policies that check org membership via path convention
-- Path format: {organization_id}/{questionnaire_instance_id}/{filename}
CREATE POLICY "Org members can upload questionnaire files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can view questionnaire files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can update questionnaire files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can delete questionnaire files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

-- Also fix onboarding-documents bucket (same issue)
DROP POLICY IF EXISTS "Users can upload onboarding documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their organization's onboarding documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their organization's onboarding documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their organization's onboarding documents" ON storage.objects;

CREATE POLICY "Org members can upload onboarding documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'onboarding-documents' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can view onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can update onboarding documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'onboarding-documents' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "Org members can delete onboarding documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'onboarding-documents' AND
  auth.uid() IS NOT NULL AND
  public.user_has_organization_access((string_to_array(name, '/'))[1]::uuid)
);
-- Sprint 1 — Increment 3b (part 2): lock down onboarding-documents bucket.
-- Removes anonymous SELECT entirely and gates anonymous INSERT on the
-- per-application access_token embedded as the 4th path segment.
-- Authenticated org-staff policies are untouched.

-- 1. Helper for the write path only. NEVER used in SELECT — self-referential
--    check is fine here because it authorises the caller's stated token.
CREATE OR REPLACE FUNCTION public.is_active_onboarding_upload_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parts text[];
  v_org uuid;
  v_app uuid;
  v_token text;
  v_row record;
BEGIN
  v_parts := string_to_array(p_name, '/');
  -- Expected path: orgId/onboarding/appId/<token>/<filename> (>=5 parts)
  IF array_length(v_parts, 1) < 5 THEN RETURN false; END IF;
  IF v_parts[2] <> 'onboarding' THEN RETURN false; END IF;
  BEGIN
    v_org := v_parts[1]::uuid;
    v_app := v_parts[3]::uuid;
  EXCEPTION WHEN others THEN RETURN false; END;
  v_token := v_parts[4];
  IF v_token IS NULL OR length(v_token) = 0 THEN RETURN false; END IF;

  SELECT status, access_token, access_token_expires_at
    INTO v_row
    FROM public.onboarding_applications
   WHERE id = v_app AND organization_id = v_org;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.status IN ('approved','rejected','cancelled') THEN RETURN false; END IF;
  IF v_row.access_token IS NULL OR v_row.access_token <> v_token THEN RETURN false; END IF;
  IF v_row.access_token_expires_at IS NOT NULL AND v_row.access_token_expires_at <= now() THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_active_onboarding_upload_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_onboarding_upload_path(text) TO anon, authenticated, service_role;

-- 2. Drop the two anon-facing policies.
DROP POLICY IF EXISTS "Public can read own onboarding documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload onboarding documents" ON storage.objects;

-- 3. New INSERT policy: token-in-path required. No new SELECT policy — anon
--    reads are closed. Reviewers/portal users continue via the untouched
--    "Org members can view onboarding documents" auth'd policy.
CREATE POLICY "Public can upload onboarding documents with token"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'onboarding-documents'
    AND public.is_active_onboarding_upload_path(name)
  );

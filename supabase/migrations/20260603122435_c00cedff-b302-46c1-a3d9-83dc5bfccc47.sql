
-- Phase 7: Onboarding data integrity guards

-- 1. Prevent duplicate portal access for same (client_id, user_id) within an org
CREATE UNIQUE INDEX IF NOT EXISTS portal_access_unique_client_user
  ON public.portal_access (organization_id, client_id, user_id)
  WHERE client_id IS NOT NULL AND user_id IS NOT NULL AND is_active = true;

-- 2. Prevent more than one signed engagement letter per onboarding application
CREATE UNIQUE INDEX IF NOT EXISTS engagement_letters_unique_signed_per_app
  ON public.engagement_letters (onboarding_application_id)
  WHERE onboarding_application_id IS NOT NULL AND signed_at IS NOT NULL;

-- 3. Indexes to speed up dashboard pipeline + diagnostics queries
CREATE INDEX IF NOT EXISTS onboarding_applications_org_status_idx
  ON public.onboarding_applications (organization_id, status);

CREATE INDEX IF NOT EXISTS onboarding_events_app_created_idx
  ON public.onboarding_events (application_id, created_at DESC);

-- 4. Helper RPC: cancel stale draft applications (orphaned, no quote/lead/client, >90d old)
CREATE OR REPLACE FUNCTION public.cancel_stale_onboarding_applications(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.user_has_organization_access(p_organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH cancelled AS (
    UPDATE public.onboarding_applications
    SET status = 'cancelled',
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND status IN ('draft', 'in_progress')
      AND quote_id IS NULL
      AND lead_id IS NULL
      AND client_id IS NULL
      AND company_id IS NULL
      AND created_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM cancelled;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_stale_onboarding_applications(uuid)
  TO authenticated, service_role;

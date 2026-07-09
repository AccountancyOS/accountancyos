-- ============================================================
-- Fix 8 · Increment 3: reconciliation — accept→approve HANDOFF integrity (READ-ONLY)
-- ============================================================
-- Extends lifecycle_reconciliation_report with the handoff checks that MUST be clean before an
-- org is flipped to canonical lifecycle (where approval becomes the sole activation gate):
--   * accepted_quotes_without_onboarding — accepted quotes with NO onboarding application. Under
--     canonical this stalls the pipeline (approval is the only gate, and it needs an application).
--     This is the LC-5 dependency surfaced by Inc 8.2.
--   * onboarding_apps_unlinked — in-flight applications with neither client_id nor company_id set.
--     approval would then CREATE a new entity instead of activating the accept-created pending
--     one → a duplicate/orphaned client.
--   * duplicate_onboarding_app_groups — quotes with >1 live application (the two-tab race, LC-5).
--
-- Still purely diagnostic: reads and reports, changes NOTHING, no flag, no gate change. Also
-- re-asserts the correct live column names (service_type, practice_id) matching the app.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lifecycle_reconciliation_report(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs_total       int;
  v_setup_pending    int;
  v_null_label       int;
  v_both_entity      int;
  v_dup_groups       int;
  v_dup_excess       int;
  v_null_dup_groups  int;
  v_active_links     int;
  v_accepted_no_onb  int;
  v_onb_unlinked     int;
  v_dup_onb_groups   int;
  v_present          text[];
  v_expected         text[] := ARRAY['jobs_client_period_uq','jobs_company_period_uq',
                                     'engagements_quote_service_uq','acl_active_client_uq',
                                     'acl_active_company_uq'];
BEGIN
  IF NOT public.user_has_organization_access(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  SELECT count(*) INTO v_jobs_total
    FROM public.jobs WHERE organization_id = p_organization_id;

  SELECT count(*) INTO v_setup_pending
    FROM public.jobs
   WHERE organization_id = p_organization_id AND period_label ILIKE 'Setup Pending';

  SELECT count(*) INTO v_null_label
    FROM public.jobs
   WHERE organization_id = p_organization_id AND period_label IS NULL AND status <> 'cancelled';

  SELECT count(*) INTO v_both_entity
    FROM public.jobs
   WHERE organization_id = p_organization_id
     AND client_id IS NOT NULL AND company_id IS NOT NULL;

  WITH grp AS (
    SELECT count(*) AS n FROM public.jobs
     WHERE organization_id = p_organization_id AND status <> 'cancelled'
     GROUP BY service_type, client_id, company_id, period_label HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0), COALESCE(sum(n - 1),0) INTO v_dup_groups, v_dup_excess FROM grp;

  WITH ngrp AS (
    SELECT 1 FROM public.jobs
     WHERE organization_id = p_organization_id AND status <> 'cancelled' AND period_label IS NULL
     GROUP BY service_type, client_id, company_id HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0) INTO v_null_dup_groups FROM ngrp;

  SELECT count(*) INTO v_active_links
    FROM public.accountant_client_links
   WHERE practice_id = p_organization_id AND status = 'active';

  -- Handoff integrity (Inc 8.3):
  SELECT count(*) INTO v_accepted_no_onb
    FROM public.quotes q
   WHERE q.organization_id = p_organization_id
     AND q.status = 'accepted'
     AND NOT EXISTS (
       SELECT 1 FROM public.onboarding_applications o
        WHERE o.quote_id = q.id AND o.status <> 'rejected');

  SELECT count(*) INTO v_onb_unlinked
    FROM public.onboarding_applications o
   WHERE o.organization_id = p_organization_id
     AND o.status NOT IN ('approved','rejected')
     AND o.client_id IS NULL AND o.company_id IS NULL;

  WITH og AS (
    SELECT quote_id FROM public.onboarding_applications
     WHERE organization_id = p_organization_id AND quote_id IS NOT NULL AND status <> 'rejected'
     GROUP BY quote_id HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0) INTO v_dup_onb_groups FROM og;

  SELECT COALESCE(array_agg(indexname), ARRAY[]::text[]) INTO v_present
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = ANY(v_expected);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'jobs_total', v_jobs_total,
    'setup_pending_jobs', v_setup_pending,
    'null_period_label_jobs', v_null_label,
    'both_entity_jobs', v_both_entity,
    'duplicate_job_groups', v_dup_groups,
    'duplicate_job_excess_rows', v_dup_excess,
    'null_label_duplicate_groups', v_null_dup_groups,
    'active_client_links', v_active_links,
    'accepted_quotes_without_onboarding', v_accepted_no_onb,
    'onboarding_apps_unlinked', v_onb_unlinked,
    'duplicate_onboarding_app_groups', v_dup_onb_groups,
    'backstop_indexes_present', to_jsonb(v_present),
    'backstop_indexes_missing', to_jsonb(ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(v_present)))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_reconciliation_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_reconciliation_report(uuid) TO authenticated;

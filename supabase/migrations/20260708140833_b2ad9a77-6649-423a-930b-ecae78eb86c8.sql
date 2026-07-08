-- ============================================================
-- Fix 8 · Increment 1: lifecycle reconciliation / preflight diagnostics (READ-ONLY)
-- ============================================================
-- Per the staged Fix 8 rollout (rules 4 + 8): before ANY activation-gate change or stricter
-- uniqueness/index migration, we need visibility into the current live data. This function is
-- purely diagnostic — it reads and reports, changes NOTHING, needs NO flag. It is the preflight
-- that later increments (rogue-writer routing, Setup-Pending absorption, index tightening) must
-- consult so those changes can "fail safely with a clear report if duplicate live data exists".
--
-- It reports, for one organization:
--   * setup_pending_jobs        — jobs still labelled 'Setup Pending' (accept-created w/o year end)
--   * null_period_label_jobs     — jobs with NULL period_label (outside every backstop index)
--   * both_entity_jobs           — jobs with BOTH client_id AND company_id set (index blind spot)
--   * duplicate_job_groups/excess— logical duplicate jobs (same org+service+entity+period_label)
--   * null_label_duplicate_groups— dup groups a NULLS-NOT-DISTINCT index would reject (preflight)
--   * active_client_links        — active accountant_client_links (accept-created activation view)
--   * backstop_indexes_present/missing — which of the 5 backstop unique indexes actually exist
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
  v_present          text[];
  v_expected         text[] := ARRAY['jobs_client_period_uq','jobs_company_period_uq',
                                     'engagements_quote_service_uq','acl_active_client_uq',
                                     'acl_active_company_uq'];
BEGIN
  -- Authorization: caller must be a member of the org (no cross-tenant reporting).
  IF NOT public.user_has_organization_access(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  SELECT count(*) INTO v_jobs_total
    FROM public.jobs WHERE organization_id = p_organization_id;

  SELECT count(*) INTO v_setup_pending
    FROM public.jobs
   WHERE organization_id = p_organization_id
     AND period_label ILIKE 'Setup Pending';

  SELECT count(*) INTO v_null_label
    FROM public.jobs
   WHERE organization_id = p_organization_id
     AND period_label IS NULL
     AND status <> 'cancelled';

  SELECT count(*) INTO v_both_entity
    FROM public.jobs
   WHERE organization_id = p_organization_id
     AND client_id IS NOT NULL AND company_id IS NOT NULL;

  -- Logical duplicate groups (GROUP BY treats NULL period_label as one group, unlike a
  -- NULLS-DISTINCT unique index) — these are the real-world duplicate jobs.
  WITH grp AS (
    SELECT count(*) AS n
      FROM public.jobs
     WHERE organization_id = p_organization_id
       AND status <> 'cancelled'
     GROUP BY service_type, client_id, company_id, period_label
    HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0), COALESCE(sum(n - 1),0) INTO v_dup_groups, v_dup_excess FROM grp;

  -- Subset: duplicate groups where period_label IS NULL — these would be REJECTED by a stricter
  -- NULLS-NOT-DISTINCT index, so they must be resolved before Increment 8.5 tightens indexes.
  WITH ngrp AS (
    SELECT 1
      FROM public.jobs
     WHERE organization_id = p_organization_id
       AND status <> 'cancelled'
       AND period_label IS NULL
     GROUP BY service_type, client_id, company_id
    HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0) INTO v_null_dup_groups FROM ngrp;

  SELECT count(*) INTO v_active_links
    FROM public.accountant_client_links
   WHERE (practice_id = p_organization_id)
     AND status = 'active';

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
    'backstop_indexes_present', to_jsonb(v_present),
    'backstop_indexes_missing', to_jsonb(ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(v_present)))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_reconciliation_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_reconciliation_report(uuid) TO authenticated;

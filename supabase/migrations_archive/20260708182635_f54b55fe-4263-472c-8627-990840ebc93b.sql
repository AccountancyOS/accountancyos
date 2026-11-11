
CREATE OR REPLACE FUNCTION public.lifecycle_reconciliation_report(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_jobs_total int;
  v_setup_pending int;
  v_null_period int;
  v_both_entity int;
  v_dup_groups int;
  v_dup_excess int;
  v_null_label_dup_groups int;
  v_active_links int;
  v_expected_idx text[] := ARRAY[
    'jobs_client_period_uq',
    'jobs_company_period_uq',
    'engagements_quote_service_uq',
    'acl_active_client_uq',
    'acl_active_company_uq'
  ];
  v_present text[];
  v_missing text[];
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_users
      WHERE organization_id = _org_id AND user_id = auth.uid()
    ) INTO v_is_member;
    IF NOT v_is_member THEN
      RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
  END IF;

  SELECT count(*) INTO v_jobs_total FROM public.jobs WHERE organization_id = _org_id;
  SELECT count(*) INTO v_setup_pending FROM public.jobs WHERE organization_id = _org_id AND status = 'Setup Pending';
  SELECT count(*) INTO v_null_period FROM public.jobs
    WHERE organization_id = _org_id AND (period_label IS NULL OR period_label = '');
  SELECT count(*) INTO v_both_entity FROM public.jobs
    WHERE organization_id = _org_id AND client_id IS NOT NULL AND company_id IS NOT NULL;

  WITH dups AS (
    SELECT count(*) AS n FROM public.jobs
    WHERE organization_id = _org_id AND period_label IS NOT NULL AND period_label <> ''
    GROUP BY organization_id, COALESCE(client_id::text,''), COALESCE(company_id::text,''),
             COALESCE(service_type,''), period_label
    HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0), COALESCE(sum(n-1),0) INTO v_dup_groups, v_dup_excess FROM dups;

  WITH ndups AS (
    SELECT count(*) AS n FROM public.jobs
    WHERE organization_id = _org_id AND (period_label IS NULL OR period_label = '')
    GROUP BY organization_id, COALESCE(client_id::text,''), COALESCE(company_id::text,''),
             COALESCE(service_type,'')
    HAVING count(*) > 1
  )
  SELECT COALESCE(count(*),0) INTO v_null_label_dup_groups FROM ndups;

  SELECT count(*) INTO v_active_links
    FROM public.accountant_client_links
    WHERE practice_id = _org_id AND status = 'active';

  SELECT COALESCE(array_agg(indexname), ARRAY[]::text[]) INTO v_present
    FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(v_expected_idx);
  SELECT COALESCE(array_agg(x), ARRAY[]::text[]) INTO v_missing
    FROM unnest(v_expected_idx) x WHERE x <> ALL(v_present);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', _org_id,
    'jobs_total', v_jobs_total,
    'setup_pending_jobs', v_setup_pending,
    'null_period_label_jobs', v_null_period,
    'both_entity_jobs', v_both_entity,
    'duplicate_job_groups', v_dup_groups,
    'duplicate_job_excess_rows', v_dup_excess,
    'null_label_duplicate_groups', v_null_label_dup_groups,
    'active_client_links', v_active_links,
    'backstop_indexes_present', to_jsonb(v_present),
    'backstop_indexes_missing', to_jsonb(v_missing)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

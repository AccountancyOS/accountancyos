-- ============================================================
-- add_service_to_client: add a single service to an existing client/company (T1-16)
-- ============================================================
-- Until now the only way to create an engagement + jobs + deadlines was accepting a quote
-- (lifecycle_materialize_jobs). This RPC lets an accountant add one service to an existing entity
-- from the Services tab, for a period THEY choose (year-end, tax year, VAT quarter, pay period, …).
-- It delegates to the same proven engine (lifecycle_upsert_job_with_deadlines), so job/deadline
-- creation stays identical to the quote path — only the trigger and the caller-chosen period differ.
--
-- Contract: exactly one of p_client_id / p_company_id must be set. Creates (or reuses) an active
-- engagement for that entity+service, then materialises the job + deadlines for the given period.
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_service_to_client(
  p_client_id uuid,
  p_company_id uuid,
  p_service_id uuid,
  p_period_start date,
  p_period_end date,
  p_period_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_service_code text;
  v_service_name text;
  v_billing_frequency text;
  v_frequency text;
  v_engagement_id uuid;
  v_job_id uuid;
BEGIN
  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of client or company';
  END IF;

  -- Resolve the owning org from the entity and check the caller belongs to it.
  IF p_company_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Entity not found';
  END IF;
  IF NOT public.user_has_organization_access(v_org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT code, name, billing_model
    INTO v_service_code, v_service_name, v_billing_frequency
    FROM public.services_catalog WHERE id = p_service_id;
  IF v_service_code IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  v_frequency := CASE WHEN v_billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END;

  -- Reuse an existing engagement for this entity+service, else create an active one.
  SELECT id INTO v_engagement_id
    FROM public.engagements
    WHERE service_id = p_service_id
      AND client_id IS NOT DISTINCT FROM p_client_id
      AND company_id IS NOT DISTINCT FROM p_company_id
    LIMIT 1;
  IF v_engagement_id IS NULL THEN
    INSERT INTO public.engagements
      (organization_id, client_id, company_id, service_id, frequency, start_date, status, activated_at)
    VALUES
      (v_org, p_client_id, p_company_id, p_service_id, v_frequency, CURRENT_DATE, 'active', now())
    RETURNING id INTO v_engagement_id;
  ELSE
    UPDATE public.engagements
      SET status = 'active', activated_at = COALESCE(activated_at, now())
      WHERE id = v_engagement_id;
  END IF;

  v_job_id := public.lifecycle_upsert_job_with_deadlines(
    v_org, p_client_id, p_company_id, v_engagement_id,
    v_service_code, v_service_name, p_period_start, p_period_end, p_period_label,
    'manual_add_service'
  );

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_service_to_client(uuid, uuid, uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_service_to_client(uuid, uuid, uuid, date, date, text) TO authenticated, service_role;

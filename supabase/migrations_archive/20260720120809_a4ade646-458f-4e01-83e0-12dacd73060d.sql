
-- Reconciliation: re-apply objects from 5 approved-but-never-executed migrations.
-- Idempotent: uses CREATE OR REPLACE / IF NOT EXISTS / DROP TRIGGER IF EXISTS.

-- 1) VAT filing approval columns (missing: snapshot_hash) --------------------
ALTER TABLE public.vat_returns
  ADD COLUMN IF NOT EXISTS model_snapshot_id uuid REFERENCES public.filing_model_snapshots(id),
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS filing_approved_by uuid,
  ADD COLUMN IF NOT EXISTS filing_approved_at timestamptz;

-- 2) VAT filing approval RPCs -----------------------------------------------
CREATE OR REPLACE FUNCTION public.record_vat_filing_approval(_vat_return_id uuid, _snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ret record; v_snap record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT * INTO v_ret FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'VAT return not found'); END IF;
  IF NOT public.user_in_organization(auth.uid(), v_ret.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF v_ret.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This VAT return has already been submitted');
  END IF;
  SELECT * INTO v_snap FROM public.filing_model_snapshots WHERE id = _snapshot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Snapshot not found'); END IF;
  IF v_snap.organization_id <> v_ret.organization_id
     OR v_snap.snapshot_type <> 'vat_return'
     OR v_snap.company_id IS DISTINCT FROM v_ret.company_id
     OR v_snap.client_id  IS DISTINCT FROM v_ret.client_id
     OR v_snap.period_start <> v_ret.period_start
     OR v_snap.period_end   <> v_ret.period_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Snapshot does not match this VAT return');
  END IF;
  IF v_ret.model_snapshot_id = _snapshot_id AND v_ret.filing_approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true,
                              'snapshot_id', _snapshot_id, 'snapshot_hash', v_ret.snapshot_hash);
  END IF;
  UPDATE public.vat_returns
     SET model_snapshot_id  = _snapshot_id, snapshot_hash = v_snap.snapshot_hash,
         filing_approved_by = auth.uid(), filing_approved_at = now(), updated_at = now()
   WHERE id = _vat_return_id;
  RETURN jsonb_build_object('success', true, 'snapshot_id', _snapshot_id, 'snapshot_hash', v_snap.snapshot_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_vat_filing_approval(_vat_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ret record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT * INTO v_ret FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'VAT return not found'); END IF;
  IF NOT public.user_in_organization(auth.uid(), v_ret.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF v_ret.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This VAT return has already been submitted');
  END IF;
  UPDATE public.vat_returns
     SET model_snapshot_id = NULL, snapshot_hash = NULL,
         filing_approved_by = NULL, filing_approved_at = NULL, updated_at = now()
   WHERE id = _vat_return_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_vat_filing_approval(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_vat_filing_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vat_filing_approval(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_vat_filing_approval(uuid) TO authenticated;

-- 3) VAT filing gate trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_vat_filing_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'submitted' AND COALESCE(OLD.status, '') <> 'submitted')
     OR (NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL) THEN
    IF NEW.model_snapshot_id IS NULL OR NEW.filing_approved_at IS NULL THEN
      RAISE EXCEPTION 'A VAT return cannot be submitted without an approved filing snapshot. Approve it for filing first.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_vat_filing_gate ON public.vat_returns;
CREATE TRIGGER trg_enforce_vat_filing_gate
  BEFORE UPDATE ON public.vat_returns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vat_filing_gate();

-- 4) CT600 filing gate trigger ----------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_ct600_filing_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_terminal text[] := ARRAY['submitted','filed','accepted'];
BEGIN
  IF NEW.filing_type IN ('CT600','ct600','corporation_tax','CT600_HMRC','CT600_XML')
     AND NEW.status = ANY(v_terminal)
     AND COALESCE(OLD.status, '') <> ALL(v_terminal)
     AND NEW.model_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'A CT600 cannot be marked submitted/filed without an approved filing snapshot. Approve it for filing first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_ct600_filing_gate ON public.filings;
CREATE TRIGGER trg_enforce_ct600_filing_gate
  BEFORE UPDATE ON public.filings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ct600_filing_gate();

-- 5) Onboarding access token generator --------------------------------------
CREATE OR REPLACE FUNCTION public.gen_onboarding_access_token()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, extensions AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- 6) Introspection RPCs for smoke test --------------------------------------
CREATE OR REPLACE FUNCTION public.get_cron_job_status(p_jobname text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record;
BEGIN
  SELECT j.jobname, j.schedule, j.active INTO r FROM cron.job j WHERE j.jobname = p_jobname LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;
  RETURN jsonb_build_object('exists', true, 'active', r.active, 'schedule', r.schedule);
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN jsonb_build_object('exists', false, 'error', 'cron schema unavailable');
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_secret_exists(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM vault.secrets WHERE name = p_name);
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status(text) TO service_role;
REVOKE ALL ON FUNCTION public.vault_secret_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_secret_exists(text) TO service_role;

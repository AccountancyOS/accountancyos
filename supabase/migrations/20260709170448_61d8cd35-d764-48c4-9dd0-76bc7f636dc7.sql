-- ============================================================
-- Filing Stage B (VAT): accountant approval of a VAT filing snapshot
-- ============================================================
-- VAT lives in vat_returns (separate from the filings/filing_approvals infra, which is scoped to
-- ACCOUNTS/CT600). It already has a CLIENT approval (portal_approve_vat_return) but no ACCOUNTANT
-- approval and no link to an immutable model snapshot. Stage B wires the accountant approval:
-- record WHICH immutable snapshot (+ its hash) the accountant approved, and by whom/when. This is
-- the internal filing control that Stage C submission and the Stage D gate will require.
--
-- Additive columns; a fail-closed SECURITY DEFINER RPC records the approval (approved_by is
-- always auth.uid(), never client-supplied) after validating the snapshot belongs to the same
-- VAT return (org + entity + period + type). Idempotent: re-approving the same snapshot is a
-- no-op success; a different snapshot supersedes (a new approval), never mutating the snapshot.
-- ============================================================

ALTER TABLE public.vat_returns
  ADD COLUMN IF NOT EXISTS model_snapshot_id uuid REFERENCES public.filing_model_snapshots(id),
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS filing_approved_by uuid,
  ADD COLUMN IF NOT EXISTS filing_approved_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_vat_filing_approval(_vat_return_id uuid, _snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret  record;
  v_snap record;
BEGIN
  -- Fail-closed authorization.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_ret FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'VAT return not found');
  END IF;
  IF NOT public.user_in_organization(auth.uid(), v_ret.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF v_ret.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This VAT return has already been submitted');
  END IF;

  SELECT * INTO v_snap FROM public.filing_model_snapshots WHERE id = _snapshot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Snapshot not found');
  END IF;

  -- The approved snapshot must genuinely belong to THIS VAT return.
  IF v_snap.organization_id <> v_ret.organization_id
     OR v_snap.snapshot_type <> 'vat_return'
     OR v_snap.company_id IS DISTINCT FROM v_ret.company_id
     OR v_snap.client_id  IS DISTINCT FROM v_ret.client_id
     OR v_snap.period_start <> v_ret.period_start
     OR v_snap.period_end   <> v_ret.period_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Snapshot does not match this VAT return');
  END IF;

  -- Idempotent: approving the same snapshot again is a no-op success.
  IF v_ret.model_snapshot_id = _snapshot_id AND v_ret.filing_approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true,
                              'snapshot_id', _snapshot_id, 'snapshot_hash', v_ret.snapshot_hash);
  END IF;

  UPDATE public.vat_returns
     SET model_snapshot_id  = _snapshot_id,
         snapshot_hash      = v_snap.snapshot_hash,
         filing_approved_by = auth.uid(),
         filing_approved_at = now(),
         updated_at         = now()
   WHERE id = _vat_return_id;

  RETURN jsonb_build_object('success', true, 'snapshot_id', _snapshot_id,
                            'snapshot_hash', v_snap.snapshot_hash);
END;
$$;

-- Reject / clear the accountant approval (only while unsubmitted). Leaves the VAT return
-- unapproved and not submittable.
CREATE OR REPLACE FUNCTION public.revoke_vat_filing_approval(_vat_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ret record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT * INTO v_ret FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'VAT return not found');
  END IF;
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

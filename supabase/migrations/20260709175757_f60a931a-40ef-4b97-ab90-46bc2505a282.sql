
-- Add VAT accountant filing-approval columns to vat_returns
ALTER TABLE public.vat_returns
  ADD COLUMN IF NOT EXISTS filing_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS filing_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS model_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS model_snapshot_hash text;

-- RPC: approve a VAT return for filing. Locks the current figures into an immutable
-- snapshot hash and stamps approver + timestamp. Only staff of the org can call.
CREATE OR REPLACE FUNCTION public.approve_vat_return_for_filing(_vat_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vat_returns%ROWTYPE;
  v_uid uuid := auth.uid();
  v_snapshot_id uuid := gen_random_uuid();
  v_hash text;
  v_payload jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Access denied: not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_row.organization_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  IF v_row.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'VAT return already submitted';
  END IF;

  IF v_row.filing_approved_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_approved', true,
      'model_snapshot_id', v_row.model_snapshot_id,
      'model_snapshot_hash', v_row.model_snapshot_hash,
      'filing_approved_at', v_row.filing_approved_at
    );
  END IF;

  v_payload := jsonb_build_object(
    'vat_return_id', v_row.id,
    'organization_id', v_row.organization_id,
    'client_id', v_row.client_id,
    'company_id', v_row.company_id,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end,
    'box_1_vat_due_sales', v_row.box_1_vat_due_sales,
    'box_2_vat_due_acquisitions', v_row.box_2_vat_due_acquisitions,
    'box_3_total_vat_due', v_row.box_3_total_vat_due,
    'box_4_vat_reclaimed', v_row.box_4_vat_reclaimed,
    'box_5_net_vat', v_row.box_5_net_vat,
    'box_6_total_sales', v_row.box_6_total_sales,
    'box_7_total_purchases', v_row.box_7_total_purchases,
    'box_8_total_supplies_eu', v_row.box_8_total_supplies_eu,
    'box_9_total_acquisitions_eu', v_row.box_9_total_acquisitions_eu
  );

  v_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

  UPDATE public.vat_returns
     SET filing_approved_at = now(),
         filing_approved_by = v_uid,
         model_snapshot_id = v_snapshot_id,
         model_snapshot_hash = v_hash,
         updated_at = now()
   WHERE id = _vat_return_id;

  RETURN jsonb_build_object(
    'ok', true,
    'model_snapshot_id', v_snapshot_id,
    'model_snapshot_hash', v_hash,
    'filing_approved_at', now()
  );
END;
$$;

-- RPC: revoke approval (e.g. figures need to change). Only allowed when not yet submitted.
CREATE OR REPLACE FUNCTION public.revoke_vat_return_filing_approval(_vat_return_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vat_returns%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Access denied: not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT return not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_row.organization_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  IF v_row.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'VAT return already submitted; cannot revoke approval';
  END IF;

  UPDATE public.vat_returns
     SET filing_approved_at = NULL,
         filing_approved_by = NULL,
         model_snapshot_id = NULL,
         model_snapshot_hash = NULL,
         client_approved_at = NULL,
         client_approved_by = NULL,
         updated_at = now()
   WHERE id = _vat_return_id;

  RETURN jsonb_build_object('ok', true, 'reason', _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_vat_return_for_filing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_vat_return_filing_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_vat_return_for_filing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_vat_return_filing_approval(uuid, text) TO authenticated;

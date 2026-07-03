-- ============================================================
-- Fix (review finding): void_invoice_safe must reverse the ledger
-- ============================================================
-- The UI calls void_invoice_safe, whose latest definition only set status='VOIDED' and even
-- let admins void PAID invoices — so voided invoices left Dr Trade Debtors / Cr Sales / Cr VAT
-- on the books permanently (AR + revenue overstated). Route it through the canonical
-- void_invoice, which reverses the original posting and refuses to void an invoice that has
-- payments (those need a credit note / refund first). Signature preserved (uuid, text).
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_invoice_safe(p_invoice_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_res jsonb;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF NOT public.can_void_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot void invoices');
  END IF;

  -- Reverse the posting + set VOIDED atomically (blocks paid invoices — those need a
  -- credit note / refund first). Soft failures return {success:false}; a posting failure
  -- inside void_invoice RAISEs and rolls the whole thing back.
  v_res := public.void_invoice(p_invoice_id, p_reason, v_user_id);
  IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
    RETURN jsonb_build_object('success', false,
      'error', COALESCE(v_res->>'error_message', v_res->>'error', 'Could not void invoice'));
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

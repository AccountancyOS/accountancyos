-- Drop legacy lowercase status CHECK constraints that predate the canonical vocabulary.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
ALTER TABLE public.bills    DROP CONSTRAINT IF EXISTS chk_bills_status;

UPDATE public.bookkeeping_accounts SET account_subtype = 'TRADE_DEBTORS'
 WHERE is_control_account = true AND account_type = 'ASSET'
   AND (name ILIKE '%debtor%' OR name ILIKE '%receivable%')
   AND COALESCE(account_subtype,'') NOT IN ('TRADE_DEBTORS','DEBTOR','RECEIVABLE','ACCOUNTS_RECEIVABLE');

UPDATE public.bookkeeping_accounts SET account_subtype = 'TRADE_CREDITORS'
 WHERE is_control_account = true AND account_type = 'LIABILITY'
   AND (name ILIKE '%creditor%' OR name ILIKE '%payable%')
   AND COALESCE(account_subtype,'') NOT IN ('TRADE_CREDITORS','CREDITOR','PAYABLE','ACCOUNTS_PAYABLE');

UPDATE public.bookkeeping_accounts SET account_subtype = 'VAT_CONTROL'
 WHERE is_control_account = true AND account_type = 'LIABILITY'
   AND name ILIKE '%vat%'
   AND COALESCE(account_subtype,'') NOT IN ('VAT_CONTROL','VAT');

UPDATE public.invoices SET status =
  CASE upper(COALESCE(status,'DRAFT'))
    WHEN 'ISSUED' THEN 'AWAITING_PAYMENT'
    WHEN 'SENT'   THEN 'AWAITING_PAYMENT'
    WHEN 'VIEWED' THEN 'AWAITING_PAYMENT'
    WHEN 'CANCELLED' THEN 'VOIDED'
    WHEN 'VOID'   THEN 'VOIDED'
    ELSE upper(COALESCE(status,'DRAFT'))
  END;

UPDATE public.bills SET status =
  CASE upper(COALESCE(status,'DRAFT'))
    WHEN 'ISSUED' THEN 'AWAITING_PAYMENT'
    WHEN 'SENT'   THEN 'AWAITING_PAYMENT'
    WHEN 'PENDING_APPROVAL' THEN 'DRAFT'
    WHEN 'APPROVED' THEN 'AWAITING_PAYMENT'
    WHEN 'CANCELLED' THEN 'VOIDED'
    WHEN 'VOID'   THEN 'VOIDED'
    ELSE upper(COALESCE(status,'DRAFT'))
  END;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'));

ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE public.bills ADD CONSTRAINT bills_status_check
  CHECK (status IN ('DRAFT','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'));

CREATE OR REPLACE FUNCTION public.issue_invoice_safe(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_org_settings record;
  v_invoice_number text;
  v_post jsonb;
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
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF NOT public.can_issue_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot issue invoices');
  END IF;
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be issued');
  END IF;

  IF v_invoice.invoice_number IS NULL OR v_invoice.invoice_number = '' THEN
    SELECT * INTO v_org_settings FROM org_settings WHERE organization_id = v_invoice.organization_id FOR UPDATE;
    IF v_org_settings IS NULL THEN
      INSERT INTO org_settings (organization_id) VALUES (v_invoice.organization_id)
      RETURNING * INTO v_org_settings;
    END IF;
    v_invoice_number := COALESCE(v_org_settings.invoice_number_prefix, 'INV-') ||
      LPAD(COALESCE(v_org_settings.invoice_number_next, 1)::text, COALESCE(v_org_settings.invoice_number_padding, 6), '0');
    UPDATE org_settings SET invoice_number_next = COALESCE(invoice_number_next, 1) + 1
    WHERE organization_id = v_invoice.organization_id;
  ELSE
    v_invoice_number := v_invoice.invoice_number;
  END IF;

  UPDATE invoices SET
    invoice_number = v_invoice_number,
    issued_at = now(),
    issued_by = v_user_id,
    locked_fields = '["total_net","total_vat","total_gross","lines"]'::jsonb,
    updated_at = now()
  WHERE id = p_invoice_id;

  v_post := public.approve_invoice(p_invoice_id, v_user_id);
  IF NOT COALESCE((v_post->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Could not post invoice to the ledger: %',
      COALESCE(v_post->>'error_message', 'posting error')
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice', p_invoice_id, 'issued',
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'AWAITING_PAYMENT', 'invoice_number', v_invoice_number));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id,
                            'invoice_number', v_invoice_number,
                            'journal_id', v_post->>'journal_id');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment_safe(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
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
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF v_invoice.status NOT IN ('AWAITING_PAYMENT', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment for this invoice status');
  END IF;

  v_res := public.record_invoice_payment(
    p_invoice_id, p_amount, p_payment_date, p_bank_account_id, NULL,
    p_reference, p_payment_method, v_user_id);

  IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Could not post payment: %',
      COALESCE(v_res->>'error_message', v_res->>'error', 'posting error')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('success', true, 'payment_id', v_res->>'payment_id');
END;
$$;
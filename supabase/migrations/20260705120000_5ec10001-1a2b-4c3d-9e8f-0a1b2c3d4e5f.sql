-- ============================================================
-- SEC-1 / Audit Fix 1: tenant authorization on the raw ledger RPCs
-- ============================================================
-- record_invoice_payment, record_bill_payment, void_invoice, void_bill and reverse_journal are
-- SECURITY DEFINER and GRANTed EXECUTE to `authenticated`, so they are callable directly via
-- PostgREST (rpc/). They had NO internal org check and trusted a caller-supplied p_user_id, so
-- any authenticated user — including any portal client — could post/void/reverse journals in
-- ANY organization and forge the actor. The *_safe wrappers gate correctly but are not the only
-- door (the accountant UI calls the raw functions directly; reverse_journal has no wrapper).
--
-- Each raw function now authorizes internally: allow service_role (trusted backend, e.g. the
-- Stripe verify edge function) OR a member of the row's organization; reject everyone else.
-- The payment/void functions also force the actor to auth.uid() for non-service callers, so
-- p_user_id can no longer be spoofed. Bodies otherwise reproduced byte-faithfully.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_bank_transaction_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_payment_fx_rate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_debtors_id uuid;
  v_fx_account_id uuid;
  v_payment_id uuid;
  v_remaining numeric;
  v_alloc numeric;
  v_over numeric;
  v_is_over boolean;
  v_entries jsonb;
  v_post_result jsonb;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_new_paid numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_invoice_rate numeric;
  v_payment_rate numeric;
  v_bank_base numeric;
  v_debtors_base numeric;
  v_fx_diff numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_amount', 'error_message', 'Payment amount must be positive');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
  END IF;
  IF NOT v_invoice.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_posted', 'error_message', 'Invoice must be posted before recording payment');
  END IF;
  -- SEC-1: tenant authorization. This SECURITY DEFINER function is granted to
  -- `authenticated` and is reachable directly via PostgREST, so it must gate here — the
  -- *_safe wrapper is not the only door. Allow a trusted backend (service_role, e.g. the
  -- Stripe verify function) or a member of the row's organization; reject portal clients
  -- and cross-tenant callers. Never trust the caller-supplied p_user_id.
  IF NOT (auth.role() = 'service_role'
          OR public.user_in_organization(auth.uid(), v_invoice.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_authorized', 'error_message', 'Not authorized for this organization');
  END IF;
  v_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;


  v_entity_type := CASE WHEN v_invoice.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_invoice.client_id, v_invoice.company_id);

  v_remaining := COALESCE(v_invoice.total_gross,0) - COALESCE(v_invoice.amount_paid,0);
  v_is_over := p_amount > v_remaining;
  v_alloc := LEAST(p_amount, v_remaining);
  v_over  := CASE WHEN v_is_over THEN p_amount - v_remaining ELSE 0 END;

  v_invoice_rate := COALESCE(v_invoice.exchange_rate, 1.0);
  v_payment_rate := COALESCE(p_payment_fx_rate, v_invoice_rate);

  SELECT id INTO v_debtors_id FROM bookkeeping_accounts
   WHERE organization_id = v_invoice.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_DEBTORS','DEBTOR','RECEIVABLE','ACCOUNTS_RECEIVABLE')
   LIMIT 1;
  IF v_debtors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Debtors account not found');
  END IF;

  INSERT INTO invoice_payments (
    invoice_id, amount, payment_date, bank_account_id, bank_transaction_id,
    reference, payment_method, payment_type, unallocated_amount, created_by, exchange_rate
  ) VALUES (
    p_invoice_id, p_amount, p_payment_date, p_bank_account_id, p_bank_transaction_id,
    p_reference, p_payment_method,
    CASE WHEN v_is_over THEN 'overpayment' ELSE 'normal' END,
    v_over, v_uid, v_payment_rate
  ) RETURNING id INTO v_payment_id;

  IF p_bank_account_id IS NOT NULL THEN
    -- Compute base-currency amounts directly (we pass fx_rate=1 to post_to_ledger
    -- because we are pre-converting). post_to_ledger uses p_fx_rate as a multiplier.
    v_bank_base    := ROUND(p_amount * v_payment_rate, 2);
    v_debtors_base := ROUND(p_amount * v_invoice_rate, 2);
    v_fx_diff      := ROUND(v_bank_base - v_debtors_base, 2);

    v_entries := jsonb_build_array(
      jsonb_build_object(
        'account_id', p_bank_account_id,
        'debit', v_bank_base, 'credit', NULL,
        'description', 'Payment received: Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
      ),
      jsonb_build_object(
        'account_id', v_debtors_id,
        'debit', NULL, 'credit', v_debtors_base,
        'description', 'Payment received: Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
      )
    );

    IF ABS(v_fx_diff) >= 0.01 THEN
      SELECT id INTO v_fx_account_id FROM bookkeeping_accounts
       WHERE organization_id = v_invoice.organization_id
         AND ((v_entity_type='client'  AND client_id  = v_entity_id)
           OR (v_entity_type='company' AND company_id = v_entity_id))
         AND is_active = true
         AND account_subtype IN ('FX_GAIN_LOSS','FOREIGN_EXCHANGE','EXCHANGE_GAIN_LOSS')
       LIMIT 1;
      IF v_fx_account_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'missing_fx_account',
          'error_message', 'FX Gain/Loss account not found for entity. Please add one with subtype FX_GAIN_LOSS.');
      END IF;

      IF v_fx_diff > 0 THEN
        -- Bank received more base than the receivable was carried at => FX gain (credit)
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_fx_account_id,
          'debit', NULL, 'credit', ABS(v_fx_diff),
          'description', 'FX gain on invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
        ));
      ELSE
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_fx_account_id,
          'debit', ABS(v_fx_diff), 'credit', NULL,
          'description', 'FX loss on invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
        ));
      END IF;
    END IF;

    v_post_result := post_to_ledger(
      p_organization_id := v_invoice.organization_id,
      p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
      p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
      p_journal_date    := p_payment_date,
      p_reference       := p_reference,
      p_description     := 'PAYMENT posting',
      p_journal_type    := 'SYSTEM',
      p_source_type     := 'PAYMENT',
      p_source_id       := v_payment_id,
      p_currency        := COALESCE(v_invoice.currency,'GBP'),
      p_fx_rate         := 1.0,
      p_created_by      := v_uid,
      p_entries         := v_entries
    );

    IF NOT (v_post_result->>'success')::boolean THEN
      RAISE EXCEPTION 'Payment posting failed: %', v_post_result->>'error_message'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new_paid := COALESCE(v_invoice.amount_paid,0) + v_alloc;
  v_new_remaining := COALESCE(v_invoice.total_gross,0) - v_new_paid;
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PART_PAID' END;

  UPDATE invoices
     SET amount_paid = v_new_paid,
         remaining_balance = v_new_remaining,
         status = v_new_status,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id,
    'fx_diff_base', COALESCE(v_fx_diff,0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_bank_transaction_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_payment_fx_rate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_creditors_id uuid;
  v_fx_account_id uuid;
  v_payment_id uuid;
  v_remaining numeric;
  v_alloc numeric;
  v_over numeric;
  v_is_over boolean;
  v_entries jsonb;
  v_post_result jsonb;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_new_paid numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_bill_rate numeric;
  v_payment_rate numeric;
  v_bank_base numeric;
  v_creditors_base numeric;
  v_fx_diff numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_amount', 'error_message', 'Payment amount must be positive');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
  END IF;
  IF NOT v_bill.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_posted', 'error_message', 'Bill must be posted before recording payment');
  END IF;
  -- SEC-1: tenant authorization. This SECURITY DEFINER function is granted to
  -- `authenticated` and is reachable directly via PostgREST, so it must gate here — the
  -- *_safe wrapper is not the only door. Allow a trusted backend (service_role, e.g. the
  -- Stripe verify function) or a member of the row's organization; reject portal clients
  -- and cross-tenant callers. Never trust the caller-supplied p_user_id.
  IF NOT (auth.role() = 'service_role'
          OR public.user_in_organization(auth.uid(), v_bill.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_authorized', 'error_message', 'Not authorized for this organization');
  END IF;
  v_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;


  v_entity_type := CASE WHEN v_bill.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_bill.client_id, v_bill.company_id);

  v_remaining := COALESCE(v_bill.total_gross,0) - COALESCE(v_bill.amount_paid,0);
  v_is_over := p_amount > v_remaining;
  v_alloc := LEAST(p_amount, v_remaining);
  v_over  := CASE WHEN v_is_over THEN p_amount - v_remaining ELSE 0 END;

  v_bill_rate := COALESCE(v_bill.exchange_rate, 1.0);
  v_payment_rate := COALESCE(p_payment_fx_rate, v_bill_rate);

  SELECT id INTO v_creditors_id FROM bookkeeping_accounts
   WHERE organization_id = v_bill.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_CREDITORS','CREDITOR','PAYABLE','ACCOUNTS_PAYABLE')
   LIMIT 1;
  IF v_creditors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Creditors account not found');
  END IF;

  INSERT INTO bill_payments (
    bill_id, amount, payment_date, bank_account_id, bank_transaction_id,
    reference, payment_method, payment_type, unallocated_amount, created_by, exchange_rate
  ) VALUES (
    p_bill_id, p_amount, p_payment_date, p_bank_account_id, p_bank_transaction_id,
    p_reference, p_payment_method,
    CASE WHEN v_is_over THEN 'overpayment' ELSE 'normal' END,
    v_over, v_uid, v_payment_rate
  ) RETURNING id INTO v_payment_id;

  IF p_bank_account_id IS NOT NULL THEN
    v_bank_base      := ROUND(p_amount * v_payment_rate, 2);
    v_creditors_base := ROUND(p_amount * v_bill_rate, 2);
    v_fx_diff        := ROUND(v_creditors_base - v_bank_base, 2);

    v_entries := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_creditors_id,
        'debit', v_creditors_base, 'credit', NULL,
        'description', 'Payment made: Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
      ),
      jsonb_build_object(
        'account_id', p_bank_account_id,
        'debit', NULL, 'credit', v_bank_base,
        'description', 'Payment made: Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
      )
    );

    IF ABS(v_fx_diff) >= 0.01 THEN
      SELECT id INTO v_fx_account_id FROM bookkeeping_accounts
       WHERE organization_id = v_bill.organization_id
         AND ((v_entity_type='client'  AND client_id  = v_entity_id)
           OR (v_entity_type='company' AND company_id = v_entity_id))
         AND is_active = true
         AND account_subtype IN ('FX_GAIN_LOSS','FOREIGN_EXCHANGE','EXCHANGE_GAIN_LOSS')
       LIMIT 1;
      IF v_fx_account_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'missing_fx_account',
          'error_message', 'FX Gain/Loss account not found for entity. Please add one with subtype FX_GAIN_LOSS.');
      END IF;

      IF v_fx_diff > 0 THEN
        -- Carried payable was greater than the base bank outflow => FX gain (credit)
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_fx_account_id,
          'debit', NULL, 'credit', ABS(v_fx_diff),
          'description', 'FX gain on bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
        ));
      ELSE
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_fx_account_id,
          'debit', ABS(v_fx_diff), 'credit', NULL,
          'description', 'FX loss on bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
        ));
      END IF;
    END IF;

    v_post_result := post_to_ledger(
      p_organization_id := v_bill.organization_id,
      p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
      p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
      p_journal_date    := p_payment_date,
      p_reference       := p_reference,
      p_description     := 'PAYMENT posting',
      p_journal_type    := 'SYSTEM',
      p_source_type     := 'PAYMENT',
      p_source_id       := v_payment_id,
      p_currency        := COALESCE(v_bill.currency,'GBP'),
      p_fx_rate         := 1.0,
      p_created_by      := v_uid,
      p_entries         := v_entries
    );

    IF NOT (v_post_result->>'success')::boolean THEN
      RAISE EXCEPTION 'Payment posting failed: %', v_post_result->>'error_message'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new_paid := COALESCE(v_bill.amount_paid,0) + v_alloc;
  v_new_remaining := COALESCE(v_bill.total_gross,0) - v_new_paid;
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PART_PAID' END;

  UPDATE bills
     SET amount_paid = v_new_paid,
         remaining_balance = v_new_remaining,
         status = v_new_status,
         updated_at = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id,
    'fx_diff_base', COALESCE(v_fx_diff,0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_journal_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
  END IF;
  IF v_invoice.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_voided', 'error_message', 'Invoice already voided');
  END IF;
  IF COALESCE(v_invoice.amount_paid,0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'has_payments', 'error_message', 'Cannot void invoice with payments. Refund first.');
  END IF;
  -- SEC-1: tenant authorization. This SECURITY DEFINER function is granted to
  -- `authenticated` and is reachable directly via PostgREST, so it must gate here — the
  -- *_safe wrapper is not the only door. Allow a trusted backend (service_role, e.g. the
  -- Stripe verify function) or a member of the row's organization; reject portal clients
  -- and cross-tenant callers. Never trust the caller-supplied p_user_id.
  IF NOT (auth.role() = 'service_role'
          OR public.user_in_organization(auth.uid(), v_invoice.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_authorized', 'error_message', 'Not authorized for this organization');
  END IF;
  v_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;


  v_entity_type := CASE WHEN v_invoice.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_invoice.client_id, v_invoice.company_id);

  IF v_invoice.is_posted THEN
    SELECT journal_id INTO v_journal_id FROM ledger_entries
      WHERE source_type = 'INVOICE' AND source_id = p_invoice_id LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      FOR v_line IN
        SELECT account_id, debit, credit, description, vat_code_id
          FROM ledger_entries WHERE journal_id = v_journal_id
      LOOP
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_line.account_id,
          'debit',  v_line.credit,
          'credit', v_line.debit,
          'description', 'REVERSAL: ' || COALESCE(v_line.description,'') ||
                         CASE WHEN p_reason IS NOT NULL THEN ' - ' || p_reason ELSE '' END,
          'vat_code_id', v_line.vat_code_id
        ));
      END LOOP;

      v_post_result := post_to_ledger(
        p_organization_id := v_invoice.organization_id,
        p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
        p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
        p_journal_date    := CURRENT_DATE,
        p_reference       := 'VOID-' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8)),
        p_description     := 'INVOICE void',
        p_journal_type    := 'SYSTEM',
        p_source_type     := 'JOURNAL',
        p_source_id       := v_journal_id,
        p_currency        := COALESCE(v_invoice.currency,'GBP'),
        p_fx_rate         := 1.0,
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE invoices SET status='VOIDED', is_posted=false, updated_at=now() WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_bill(
  p_bill_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_journal_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
  END IF;
  IF v_bill.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_voided', 'error_message', 'Bill already voided');
  END IF;
  IF COALESCE(v_bill.amount_paid,0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'has_payments', 'error_message', 'Cannot void bill with payments. Refund first.');
  END IF;
  -- SEC-1: tenant authorization. This SECURITY DEFINER function is granted to
  -- `authenticated` and is reachable directly via PostgREST, so it must gate here — the
  -- *_safe wrapper is not the only door. Allow a trusted backend (service_role, e.g. the
  -- Stripe verify function) or a member of the row's organization; reject portal clients
  -- and cross-tenant callers. Never trust the caller-supplied p_user_id.
  IF NOT (auth.role() = 'service_role'
          OR public.user_in_organization(auth.uid(), v_bill.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_authorized', 'error_message', 'Not authorized for this organization');
  END IF;
  v_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;


  v_entity_type := CASE WHEN v_bill.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_bill.client_id, v_bill.company_id);

  IF v_bill.is_posted THEN
    SELECT journal_id INTO v_journal_id FROM ledger_entries
      WHERE source_type = 'BILL' AND source_id = p_bill_id LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      FOR v_line IN
        SELECT account_id, debit, credit, description, vat_code_id
          FROM ledger_entries WHERE journal_id = v_journal_id
      LOOP
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_line.account_id,
          'debit',  v_line.credit,
          'credit', v_line.debit,
          'description', 'REVERSAL: ' || COALESCE(v_line.description,'') ||
                         CASE WHEN p_reason IS NOT NULL THEN ' - ' || p_reason ELSE '' END,
          'vat_code_id', v_line.vat_code_id
        ));
      END LOOP;

      v_post_result := post_to_ledger(
        p_organization_id := v_bill.organization_id,
        p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
        p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
        p_journal_date    := CURRENT_DATE,
        p_reference       := 'VOID-' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8)),
        p_description     := 'BILL void',
        p_journal_type    := 'SYSTEM',
        p_source_type     := 'JOURNAL',
        p_source_id       := v_journal_id,
        p_currency        := COALESCE(v_bill.currency,'GBP'),
        p_fx_rate         := 1.0,
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE bills SET status='VOIDED', is_posted=false, updated_at=now() WHERE id = p_bill_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal(
  p_journal_id UUID,
  p_reversal_date DATE,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_original_journal RECORD;
  v_new_journal_id UUID;
  v_is_locked BOOLEAN;
  v_line RECORD;
BEGIN
  -- Get the original journal
  SELECT * INTO v_original_journal
  FROM public.journals
  WHERE id = p_journal_id;
  
  IF v_original_journal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal not found');
  END IF;
  
  -- Check if already reversed
  IF v_original_journal.is_reversed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal has already been reversed');
  END IF;
  -- SEC-1: tenant authorization (SECURITY DEFINER + PostgREST-reachable, no _safe wrapper).
  IF NOT (auth.role() = 'service_role'
          OR public.user_in_organization(auth.uid(), v_original_journal.organization_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for this organization');
  END IF;

  
  -- Check if reversal date is in a locked period
  v_is_locked := public.is_period_locked(
    v_original_journal.organization_id,
    v_original_journal.client_id,
    v_original_journal.company_id,
    p_reversal_date
  );
  
  IF v_is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal date is in a locked period');
  END IF;
  
  -- Generate new journal ID
  v_new_journal_id := gen_random_uuid();
  
  -- Create the reversal journal
  INSERT INTO public.journals (
    id,
    organization_id,
    client_id,
    company_id,
    journal_date,
    reference,
    description,
    journal_type,
    status,
    total_debit,
    total_credit,
    transaction_currency,
    fx_rate_to_base,
    reverses_journal_id,
    created_by
  ) VALUES (
    v_new_journal_id,
    v_original_journal.organization_id,
    v_original_journal.client_id,
    v_original_journal.company_id,
    p_reversal_date,
    'REV-' || v_original_journal.reference,
    COALESCE(p_reason, 'Reversal of ' || v_original_journal.reference),
    'REVERSING',
    'POSTED',
    v_original_journal.total_credit, -- Swapped
    v_original_journal.total_debit,  -- Swapped
    v_original_journal.transaction_currency,
    v_original_journal.fx_rate_to_base,
    p_journal_id,
    auth.uid()
  );
  
  -- Copy and reverse the journal lines
  FOR v_line IN 
    SELECT * FROM public.journal_lines WHERE journal_id = p_journal_id
  LOOP
    INSERT INTO public.journal_lines (
      journal_id,
      account_id,
      debit,
      credit,
      description
    ) VALUES (
      v_new_journal_id,
      v_line.account_id,
      v_line.credit, -- Swapped
      v_line.debit,  -- Swapped
      'Reversal: ' || COALESCE(v_line.description, '')
    );
  END LOOP;
  
  -- Create reversed ledger entries
  INSERT INTO public.ledger_entries (
    organization_id,
    client_id,
    company_id,
    account_id,
    entry_date,
    transaction_date,
    debit,
    credit,
    description,
    reference,
    journal_id,
    source_type,
    source_id,
    transaction_currency,
    transaction_debit,
    transaction_credit,
    fx_rate_to_base,
    base_currency
  )
  SELECT
    organization_id,
    client_id,
    company_id,
    account_id,
    p_reversal_date,
    p_reversal_date,
    credit, -- Swapped
    debit,  -- Swapped
    'Reversal: ' || COALESCE(description, ''),
    'REV-' || reference,
    v_new_journal_id,
    source_type,
    source_id,
    transaction_currency,
    transaction_credit, -- Swapped
    transaction_debit,  -- Swapped
    fx_rate_to_base,
    base_currency
  FROM public.ledger_entries
  WHERE journal_id = p_journal_id;
  
  -- Mark original as reversed
  UPDATE public.journals
  SET is_reversed = TRUE,
      reversal_date = p_reversal_date
  WHERE id = p_journal_id;
  
  -- Log to audit
  INSERT INTO public.audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    v_original_journal.organization_id,
    'journal',
    p_journal_id,
    'reversed',
    auth.uid(),
    p_journal_id::TEXT,
    v_new_journal_id::TEXT,
    jsonb_build_object(
      'reversal_journal_id', v_new_journal_id,
      'reversal_date', p_reversal_date,
      'reason', p_reason
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reversal_journal_id', v_new_journal_id,
    'message', 'Journal reversed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

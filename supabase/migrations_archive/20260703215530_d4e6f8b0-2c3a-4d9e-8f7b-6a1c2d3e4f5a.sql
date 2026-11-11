-- ============================================================
-- Fix (review findings B2 + E2): record_*_payment overload ambiguity + backwards FX
-- ============================================================
-- B2: record_invoice_payment / record_bill_payment each had two live overloads (8-arg and
--     9-arg). record_*_payment_safe calls with 8 positional args, which matched both -> the
--     call was ambiguous and errored. Drop the legacy 8-arg overloads; the 9-arg (with
--     p_payment_fx_rate DEFAULT NULL) then resolves uniquely for every caller.
-- E2: the 9-arg version derived base-currency amounts by DIVIDING by the fx rate, but
--     post_to_ledger multiplies (v_debit * p_fx_rate) and approve_invoice books Trade Debtors
--     at amount * rate. So for any non-GBP invoice the debtors control never cleared. Flip the
--     pre-conversion to multiply (rates COALESCE to 1.0, so GBP is unchanged).
-- Function bodies otherwise reproduced byte-faithfully.
-- ============================================================

DROP FUNCTION IF EXISTS public.record_invoice_payment(uuid, numeric, date, uuid, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_bill_payment(uuid, numeric, date, uuid, uuid, text, text, uuid);

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

-- Phase 3 Slice 1: Atomic invoice/bill/payment RPCs
-- All flows route through post_to_ledger inside one transaction.
-- ledger_entries / journals stay locked to service_role per Phase 1 contract.

-- ============================================================
-- approve_invoice: atomically post DRAFT sales invoice to ledger
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_invoice(
  p_invoice_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_debtors_id uuid;
  v_vat_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
  END IF;

  IF v_invoice.status <> 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_status', 'error_message', 'Invoice is not in draft status');
  END IF;
  IF v_invoice.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_posted', 'error_message', 'Invoice already posted');
  END IF;

  v_entity_type := CASE WHEN v_invoice.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_invoice.client_id, v_invoice.company_id);

  -- Resolve control accounts (structured taxonomy, not name matching)
  SELECT id INTO v_debtors_id FROM bookkeeping_accounts
   WHERE organization_id = v_invoice.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_DEBTORS','DEBTOR','RECEIVABLE','ACCOUNTS_RECEIVABLE')
   LIMIT 1;
  IF v_debtors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Debtors control account not found');
  END IF;

  SELECT id INTO v_vat_id FROM bookkeeping_accounts
   WHERE organization_id = v_invoice.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('VAT_CONTROL','VAT')
   LIMIT 1;

  -- DR Trade Debtors (gross)
  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'account_id', v_debtors_id,
    'debit', v_invoice.total_gross,
    'credit', NULL,
    'description', 'Sales Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8)) || ': ' || COALESCE(v_invoice.contact_name,'')
  ));

  -- CR Sales accounts per line (net)
  FOR v_line IN SELECT * FROM invoice_lines WHERE invoice_id = p_invoice_id ORDER BY line_number LOOP
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_line.account_id,
      'debit', NULL,
      'credit', v_line.net_amount,
      'description', COALESCE(v_invoice.invoice_number,'') || ': ' || v_line.description,
      'vat_code_id', v_line.vat_code_id
    ));
  END LOOP;

  -- CR VAT Control (total VAT)
  IF v_invoice.total_vat > 0 AND v_vat_id IS NOT NULL THEN
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_vat_id,
      'debit', NULL,
      'credit', v_invoice.total_vat,
      'description', 'VAT on Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
    ));
  END IF;

  v_post_result := post_to_ledger(
    p_organization_id := v_invoice.organization_id,
    p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
    p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
    p_journal_date    := v_invoice.issue_date,
    p_reference       := v_invoice.invoice_number,
    p_description     := 'INVOICE posting',
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'INVOICE',
    p_source_id       := p_invoice_id,
    p_currency        := COALESCE(v_invoice.currency,'GBP'),
    p_fx_rate         := COALESCE(v_invoice.exchange_rate,1.0),
    p_created_by      := v_uid,
    p_entries         := v_entries
  );

  IF NOT (v_post_result->>'success')::boolean THEN
    RAISE EXCEPTION 'Posting failed: %', v_post_result->>'error_message'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE invoices
     SET status = 'AWAITING_PAYMENT',
         is_posted = true,
         posted_at = now(),
         posted_by = v_uid,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_post_result->>'journal_id');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_invoice(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- approve_bill: atomically post DRAFT purchase bill to ledger
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_bill(
  p_bill_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_creditors_id uuid;
  v_vat_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
  END IF;
  IF v_bill.status <> 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_status', 'error_message', 'Bill is not in draft status');
  END IF;
  IF v_bill.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_posted', 'error_message', 'Bill already posted');
  END IF;

  v_entity_type := CASE WHEN v_bill.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_bill.client_id, v_bill.company_id);

  SELECT id INTO v_creditors_id FROM bookkeeping_accounts
   WHERE organization_id = v_bill.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_CREDITORS','CREDITOR','PAYABLE','ACCOUNTS_PAYABLE')
   LIMIT 1;
  IF v_creditors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Creditors control account not found');
  END IF;

  SELECT id INTO v_vat_id FROM bookkeeping_accounts
   WHERE organization_id = v_bill.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('VAT_CONTROL','VAT')
   LIMIT 1;

  -- DR expense accounts per line (net)
  FOR v_line IN SELECT * FROM bill_lines WHERE bill_id = p_bill_id ORDER BY line_number LOOP
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_line.account_id,
      'debit', v_line.net_amount,
      'credit', NULL,
      'description', 'Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8)) || ': ' || v_line.description,
      'vat_code_id', v_line.vat_code_id
    ));
  END LOOP;

  IF v_bill.total_vat > 0 AND v_vat_id IS NOT NULL THEN
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_vat_id,
      'debit', v_bill.total_vat,
      'credit', NULL,
      'description', 'VAT on Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
    ));
  END IF;

  -- CR Trade Creditors (gross)
  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'account_id', v_creditors_id,
    'debit', NULL,
    'credit', v_bill.total_gross,
    'description', 'Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
  ));

  v_post_result := post_to_ledger(
    p_organization_id := v_bill.organization_id,
    p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
    p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
    p_journal_date    := v_bill.issue_date,
    p_reference       := v_bill.bill_number,
    p_description     := 'BILL posting',
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'BILL',
    p_source_id       := p_bill_id,
    p_currency        := COALESCE(v_bill.currency,'GBP'),
    p_fx_rate         := COALESCE(v_bill.exchange_rate,1.0),
    p_created_by      := v_uid,
    p_entries         := v_entries
  );

  IF NOT (v_post_result->>'success')::boolean THEN
    RAISE EXCEPTION 'Posting failed: %', v_post_result->>'error_message'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bills
     SET status = 'AWAITING_PAYMENT',
         is_posted = true,
         posted_at = now(),
         posted_by = v_uid,
         updated_at = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_post_result->>'journal_id');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_bill(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_bill(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- record_invoice_payment: insert payment + post DR Bank / CR AR atomically
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_bank_transaction_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_debtors_id uuid;
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
    reference, payment_method, payment_type, unallocated_amount, created_by
  ) VALUES (
    p_invoice_id, p_amount, p_payment_date, p_bank_account_id, p_bank_transaction_id,
    p_reference, p_payment_method,
    CASE WHEN v_is_over THEN 'overpayment' ELSE 'normal' END,
    v_over, v_uid
  ) RETURNING id INTO v_payment_id;

  IF p_bank_account_id IS NOT NULL THEN
    v_entries := jsonb_build_array(
      jsonb_build_object(
        'account_id', p_bank_account_id,
        'debit', p_amount, 'credit', NULL,
        'description', 'Payment received: Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
      ),
      jsonb_build_object(
        'account_id', v_debtors_id,
        'debit', NULL, 'credit', p_amount,
        'description', 'Payment received: Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
      )
    );

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
      p_fx_rate         := COALESCE(v_invoice.exchange_rate,1.0),
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

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, date, uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, date, uuid, uuid, text, text, uuid) TO authenticated, service_role;

-- ============================================================
-- record_bill_payment: atomic supplier payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_bank_transaction_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_creditors_id uuid;
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
    reference, payment_method, payment_type, unallocated_amount, created_by
  ) VALUES (
    p_bill_id, p_amount, p_payment_date, p_bank_account_id, p_bank_transaction_id,
    p_reference, p_payment_method,
    CASE WHEN v_is_over THEN 'overpayment' ELSE 'normal' END,
    v_over, v_uid
  ) RETURNING id INTO v_payment_id;

  IF p_bank_account_id IS NOT NULL THEN
    v_entries := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_creditors_id,
        'debit', p_amount, 'credit', NULL,
        'description', 'Payment: Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
      ),
      jsonb_build_object(
        'account_id', p_bank_account_id,
        'debit', NULL, 'credit', p_amount,
        'description', 'Payment: Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
      )
    );

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
      p_fx_rate         := COALESCE(v_bill.exchange_rate,1.0),
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

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_bill_payment(uuid, numeric, date, uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_bill_payment(uuid, numeric, date, uuid, uuid, text, text, uuid) TO authenticated, service_role;

-- ============================================================
-- void_invoice / void_bill: server-side reversal via post_to_ledger
-- ============================================================
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
        p_fx_rate         := COALESCE(v_invoice.exchange_rate,1.0),
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE invoices SET status='VOIDED', updated_at=now() WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text, uuid) TO authenticated, service_role;

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
        p_fx_rate         := COALESCE(v_bill.exchange_rate,1.0),
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE bills SET status='VOIDED', updated_at=now() WHERE id = p_bill_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_bill(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_bill(uuid, text, uuid) TO authenticated, service_role;

-- ============================================================
-- Fix (review finding B3): apply_bank_match was broken 3 ways
-- ============================================================
-- 1. Read v_settings.ar_control_account_id / ap_control_account_id — org_settings has no such
--    columns (they're accounts_receivable_account_id / accounts_payable_account_id), so every
--    match raised "column does not exist".
-- 2. Called post_to_ledger with p_transaction_date (the param is p_journal_date) AND omitted
--    the required p_reference + p_journal_type — the call could never resolve.
-- 3. Never checked post_to_ledger's success flag, so a failed post would leave the bank txn
--    marked MATCHED with a NULL journal (orphaned invoice_payments) — silent wrong books.
-- Fixed all three; function reproduced byte-faithfully otherwise.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_bank_match(
  p_bank_transaction_id UUID,
  p_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn RECORD;
  v_alloc JSONB;
  v_doc_id UUID;
  v_doc_type TEXT;
  v_amount NUMERIC;
  v_total_allocated NUMERIC := 0;
  v_journal_id UUID;
  v_settings RECORD;
  v_contra_account_id UUID;
  v_invoice RECORD;
  v_bill RECORD;
  v_entries JSONB := '[]'::jsonb;
  v_user_id UUID := auth.uid();
  v_post_result JSONB;
  v_before JSONB;
BEGIN
  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank transaction not found';
  END IF;
  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED') THEN
    RAISE EXCEPTION 'Transaction already %', v_txn.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = v_user_id AND organization_id = v_txn.organization_id
  ) THEN
    RAISE EXCEPTION 'Not authorised for organization';
  END IF;

  PERFORM assert_no_locked_period_write(
    v_txn.organization_id, v_txn.client_id, v_txn.company_id, v_txn.transaction_date
  );

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_amount := (v_alloc->>'amount')::numeric;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Allocation amounts must be positive';
    END IF;
    v_total_allocated := v_total_allocated + v_amount;
  END LOOP;

  IF ROUND(v_total_allocated::numeric, 2) <> ROUND(ABS(v_txn.amount)::numeric, 2) THEN
    RAISE EXCEPTION 'Allocations (%) must equal transaction amount (%)',
      v_total_allocated, ABS(v_txn.amount);
  END IF;

  SELECT * INTO v_settings FROM public.org_settings
   WHERE organization_id = v_txn.organization_id
   LIMIT 1;

  v_before := to_jsonb(v_txn);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_doc_id := (v_alloc->>'document_id')::uuid;
    v_doc_type := v_alloc->>'document_type';
    v_amount := (v_alloc->>'amount')::numeric;

    IF v_doc_type = 'invoice' THEN
      SELECT * INTO v_invoice FROM public.invoices WHERE id = v_doc_id;
      IF NOT FOUND OR v_invoice.organization_id <> v_txn.organization_id THEN
        RAISE EXCEPTION 'Invoice % not found or cross-tenant', v_doc_id;
      END IF;
      IF v_invoice.client_id IS DISTINCT FROM v_txn.client_id
         OR v_invoice.company_id IS DISTINCT FROM v_txn.company_id THEN
        RAISE EXCEPTION 'Invoice % belongs to a different entity', v_doc_id;
      END IF;

      v_contra_account_id := v_settings.accounts_receivable_account_id;
      IF v_contra_account_id IS NULL THEN
        RAISE EXCEPTION 'AR control account not configured in org_settings';
      END IF;

      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account_id', v_txn.bank_account_id, 'debit', v_amount, 'credit', 0,
                           'description', 'Receipt: invoice ' || COALESCE(v_invoice.invoice_number, v_doc_id::text)),
        jsonb_build_object('account_id', v_contra_account_id, 'debit', 0, 'credit', v_amount,
                           'description', 'Receipt: invoice ' || COALESCE(v_invoice.invoice_number, v_doc_id::text))
      );

      INSERT INTO public.invoice_payments(
        invoice_id, amount, payment_date, bank_account_id,
        bank_transaction_id, reference, payment_type, created_by
      ) VALUES (
        v_doc_id, v_amount, v_txn.transaction_date, v_txn.bank_account_id,
        p_bank_transaction_id,
        'Bank match: ' || LEFT(COALESCE(v_txn.description,''), 80),
        'normal', v_user_id
      );

    ELSIF v_doc_type = 'bill' THEN
      SELECT * INTO v_bill FROM public.bills WHERE id = v_doc_id;
      IF NOT FOUND OR v_bill.organization_id <> v_txn.organization_id THEN
        RAISE EXCEPTION 'Bill % not found or cross-tenant', v_doc_id;
      END IF;
      IF v_bill.client_id IS DISTINCT FROM v_txn.client_id
         OR v_bill.company_id IS DISTINCT FROM v_txn.company_id THEN
        RAISE EXCEPTION 'Bill % belongs to a different entity', v_doc_id;
      END IF;

      v_contra_account_id := v_settings.accounts_payable_account_id;
      IF v_contra_account_id IS NULL THEN
        RAISE EXCEPTION 'AP control account not configured in org_settings';
      END IF;

      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account_id', v_contra_account_id, 'debit', v_amount, 'credit', 0,
                           'description', 'Payment: bill ' || COALESCE(v_bill.bill_number, v_doc_id::text)),
        jsonb_build_object('account_id', v_txn.bank_account_id, 'debit', 0, 'credit', v_amount,
                           'description', 'Payment: bill ' || COALESCE(v_bill.bill_number, v_doc_id::text))
      );

      INSERT INTO public.bill_payments(
        bill_id, amount, payment_date, bank_account_id,
        bank_transaction_id, reference, payment_type, created_by
      ) VALUES (
        v_doc_id, v_amount, v_txn.transaction_date, v_txn.bank_account_id,
        p_bank_transaction_id,
        'Bank match: ' || LEFT(COALESCE(v_txn.description,''), 80),
        'normal', v_user_id
      );
    ELSE
      RAISE EXCEPTION 'Unsupported document type: %', v_doc_type;
    END IF;
  END LOOP;

  v_post_result := public.post_to_ledger(
    p_organization_id := v_txn.organization_id,
    p_client_id       := v_txn.client_id,
    p_company_id      := v_txn.company_id,
    p_journal_date    := v_txn.transaction_date,
    p_reference       := 'Bank match: ' || LEFT(COALESCE(v_txn.description,''), 80),
    p_description     := 'Bank match: ' || LEFT(COALESCE(v_txn.description,''), 80),
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'BANK_TRANSACTION',
    p_source_id       := p_bank_transaction_id,
    p_entries         := v_entries
  );

  IF NOT COALESCE((v_post_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Bank match posting failed: %', COALESCE(v_post_result->>'error', 'unknown error');
  END IF;

  v_journal_id := (v_post_result->>'journal_id')::uuid;

  UPDATE public.bank_transactions
     SET status = 'MATCHED',
         matched_ledger_entry_id = v_journal_id
   WHERE id = p_bank_transaction_id;

  INSERT INTO public.bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id,
    before_state, after_state, metadata
  ) VALUES (
    v_txn.organization_id, 'bank_transaction', p_bank_transaction_id, 'apply_bank_match', v_user_id,
    v_before,
    jsonb_build_object('status','MATCHED','journal_id',v_journal_id),
    jsonb_build_object('allocations', p_allocations)
  );

  RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$;

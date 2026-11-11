
-- ===== CSV Import dedup =====
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS import_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_import_hash
  ON public.bank_transactions(bank_account_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- ===== apply_bank_match RPC =====
-- Server-side matcher: posts the ledger journal AND updates document state
-- atomically. Routes ALL ledger writes through post_to_ledger.
CREATE OR REPLACE FUNCTION public.apply_bank_match(
  p_bank_transaction_id UUID,
  p_allocations JSONB  -- [{document_id, document_type, amount}]
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
BEGIN
  -- Load and validate transaction
  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank transaction not found';
  END IF;
  IF v_txn.status = 'MATCHED' THEN
    RAISE EXCEPTION 'Transaction already matched';
  END IF;

  -- Tenant guard via RLS-ish check (must be member of org)
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = v_user_id AND organization_id = v_txn.organization_id
  ) THEN
    RAISE EXCEPTION 'Not authorised for organization';
  END IF;

  -- Sum and validate allocations
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

  -- Load org control accounts
  SELECT * INTO v_settings FROM public.org_settings
   WHERE organization_id = v_txn.organization_id
   LIMIT 1;

  -- Build entries and update documents
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_doc_id := (v_alloc->>'document_id')::uuid;
    v_doc_type := v_alloc->>'document_type';
    v_amount := (v_alloc->>'amount')::numeric;

    IF v_doc_type = 'invoice' THEN
      SELECT * INTO v_invoice FROM public.invoices WHERE id = v_doc_id;
      IF NOT FOUND OR v_invoice.organization_id <> v_txn.organization_id THEN
        RAISE EXCEPTION 'Invoice % not found or cross-tenant', v_doc_id;
      END IF;

      v_contra_account_id := COALESCE(v_settings.ar_control_account_id);
      IF v_contra_account_id IS NULL THEN
        RAISE EXCEPTION 'AR control account not configured in org_settings';
      END IF;

      -- Build double entry: Dr Bank / Cr AR (money in)
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

      UPDATE public.invoices SET
        amount_paid = COALESCE(amount_paid,0) + v_amount,
        remaining_balance = total_gross - (COALESCE(amount_paid,0) + v_amount),
        status = CASE WHEN total_gross - (COALESCE(amount_paid,0) + v_amount) <= 0.005
                      THEN 'PAID' ELSE 'PART_PAID' END
      WHERE id = v_doc_id;

    ELSIF v_doc_type = 'bill' THEN
      SELECT * INTO v_bill FROM public.bills WHERE id = v_doc_id;
      IF NOT FOUND OR v_bill.organization_id <> v_txn.organization_id THEN
        RAISE EXCEPTION 'Bill % not found or cross-tenant', v_doc_id;
      END IF;

      v_contra_account_id := COALESCE(v_settings.ap_control_account_id);
      IF v_contra_account_id IS NULL THEN
        RAISE EXCEPTION 'AP control account not configured in org_settings';
      END IF;

      -- Dr AP / Cr Bank (money out)
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

      UPDATE public.bills SET
        amount_paid = COALESCE(amount_paid,0) + v_amount,
        remaining_balance = total_gross - (COALESCE(amount_paid,0) + v_amount),
        status = CASE WHEN total_gross - (COALESCE(amount_paid,0) + v_amount) <= 0.005
                      THEN 'PAID' ELSE 'PART_PAID' END
      WHERE id = v_doc_id;
    ELSE
      RAISE EXCEPTION 'Unsupported document type: %', v_doc_type;
    END IF;
  END LOOP;

  -- Post to ledger using hardened RPC
  v_post_result := public.post_to_ledger(
    p_organization_id := v_txn.organization_id,
    p_client_id       := v_txn.client_id,
    p_company_id      := v_txn.company_id,
    p_transaction_date:= v_txn.transaction_date,
    p_description     := 'Bank match: ' || LEFT(COALESCE(v_txn.description,''), 80),
    p_source_type     := 'BANK_TRANSACTION',
    p_source_id       := p_bank_transaction_id,
    p_entries         := v_entries
  );

  v_journal_id := (v_post_result->>'journal_id')::uuid;

  -- Mark txn matched
  UPDATE public.bank_transactions
     SET status = 'MATCHED',
         matched_ledger_entry_id = v_journal_id
   WHERE id = p_bank_transaction_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bank_match(UUID, JSONB) TO authenticated;

-- ===== preview_bank_rules RPC =====
-- Dry run: returns proposed rule matches for un-categorised transactions
-- without writing anything.
CREATE OR REPLACE FUNCTION public.preview_bank_rules(
  p_organization_id UUID,
  p_bank_account_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  bank_transaction_id UUID,
  transaction_date DATE,
  description TEXT,
  amount NUMERIC,
  rule_id UUID,
  rule_name TEXT,
  proposed_contra_account_id UUID,
  proposed_contra_account_code TEXT,
  proposed_contra_account_name TEXT,
  match_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = auth.uid() AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Not authorised for organization';
  END IF;

  RETURN QUERY
  WITH txns AS (
    SELECT t.*
      FROM public.bank_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.status IN ('PENDING','UNREVIEWED')
       AND (p_bank_account_id IS NULL OR t.bank_account_id = p_bank_account_id)
     ORDER BY t.transaction_date DESC
     LIMIT p_limit
  )
  SELECT
    t.id,
    t.transaction_date,
    t.description,
    t.amount,
    r.id,
    r.name,
    r.contra_account_id,
    a.code,
    a.name,
    CASE
      WHEN r.match_type = 'contains' THEN 'Description contains "' || r.match_value || '"'
      WHEN r.match_type = 'starts_with' THEN 'Description starts with "' || r.match_value || '"'
      WHEN r.match_type = 'equals' THEN 'Description equals "' || r.match_value || '"'
      ELSE 'Rule match'
    END
  FROM txns t
  JOIN public.bank_rules r
    ON r.organization_id = t.organization_id
   AND r.is_active = true
   AND (
        (r.match_type = 'contains'    AND t.description ILIKE '%' || r.match_value || '%')
     OR (r.match_type = 'starts_with' AND t.description ILIKE r.match_value || '%')
     OR (r.match_type = 'equals'      AND t.description ILIKE r.match_value)
   )
   AND (r.bank_account_id IS NULL OR r.bank_account_id = t.bank_account_id)
   AND (
         (r.amount_condition IS NULL)
      OR (r.amount_condition = 'money_in'  AND t.amount > 0)
      OR (r.amount_condition = 'money_out' AND t.amount < 0)
   )
  LEFT JOIN public.bookkeeping_accounts a ON a.id = r.contra_account_id
  ORDER BY t.transaction_date DESC, r.priority NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_bank_rules(UUID, UUID, INTEGER) TO authenticated;


-- Phase 4 Slice 6: Reconciliation hardening

-- Add fields needed for safe lifecycle
ALTER TABLE public.reconciliations
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS difference numeric;

-- Helper: ensure caller belongs to org
-- (assumes is_org_member exists from earlier slices; if not, fall back to organization_users)

-- start_bank_reconciliation
CREATE OR REPLACE FUNCTION public.start_bank_reconciliation(
  p_bank_account_id uuid,
  p_statement_start_date date,
  p_statement_end_date date,
  p_statement_opening_balance numeric,
  p_statement_closing_balance numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_client uuid;
  v_company uuid;
  v_id uuid;
  v_existing uuid;
BEGIN
  SELECT organization_id, client_id, company_id
    INTO v_org, v_client, v_company
  FROM public.bank_accounts WHERE id = p_bank_account_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_org AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  IF p_statement_end_date < p_statement_start_date THEN
    RAISE EXCEPTION 'Statement end date must be on or after start date';
  END IF;

  -- Locked-period guard: cannot reconcile inside a locked period
  PERFORM public.assert_no_locked_period_write(v_org, v_client, v_company, p_statement_end_date);

  -- Prevent overlapping in-progress reconciliations for same account
  SELECT id INTO v_existing
  FROM public.reconciliations
  WHERE bank_account_id = p_bank_account_id
    AND status = 'in_progress'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'An in-progress reconciliation already exists for this bank account: %', v_existing;
  END IF;

  -- Prevent overlapping date ranges with completed reconciliations
  IF EXISTS (
    SELECT 1 FROM public.reconciliations
    WHERE bank_account_id = p_bank_account_id
      AND status = 'completed'
      AND daterange(statement_start_date, statement_end_date, '[]') &&
          daterange(p_statement_start_date, p_statement_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Date range overlaps an existing completed reconciliation';
  END IF;

  INSERT INTO public.reconciliations (
    organization_id, client_id, company_id, bank_account_id,
    statement_start_date, statement_end_date,
    statement_opening_balance, statement_closing_balance,
    status, created_by
  ) VALUES (
    v_org, v_client, v_company, p_bank_account_id,
    p_statement_start_date, p_statement_end_date,
    p_statement_opening_balance, p_statement_closing_balance,
    'in_progress', auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.bookkeeping_audit_log (
    organization_id, client_id, company_id, entity_type, entity_id, action, performed_by, metadata
  ) VALUES (
    v_org, v_client, v_company, 'reconciliation', v_id, 'start_bank_reconciliation', auth.uid(),
    jsonb_build_object(
      'bank_account_id', p_bank_account_id,
      'period', jsonb_build_object('start', p_statement_start_date, 'end', p_statement_end_date),
      'opening', p_statement_opening_balance,
      'closing', p_statement_closing_balance
    )
  );

  RETURN v_id;
END;
$$;

-- add_reconciliation_line
CREATE OR REPLACE FUNCTION public.add_reconciliation_line(
  p_reconciliation_id uuid,
  p_bank_transaction_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.reconciliations%ROWTYPE;
  v_txn public.bank_transactions%ROWTYPE;
  v_line_id uuid;
BEGIN
  SELECT * INTO v_rec FROM public.reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF v_rec.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Reconciliation is not in progress (status=%)', v_rec.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_rec.organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;

  IF v_txn.bank_account_id <> v_rec.bank_account_id THEN
    RAISE EXCEPTION 'Transaction belongs to a different bank account';
  END IF;
  IF v_txn.transaction_date < v_rec.statement_start_date
     OR v_txn.transaction_date > v_rec.statement_end_date THEN
    RAISE EXCEPTION 'Transaction date % outside reconciliation period', v_txn.transaction_date;
  END IF;
  IF v_txn.matched_ledger_entry_id IS NULL THEN
    RAISE EXCEPTION 'Transaction must be posted/matched to the ledger before reconciliation';
  END IF;

  -- Prevent duplicate inclusion in any reconciliation
  IF EXISTS (
    SELECT 1 FROM public.reconciliation_lines
    WHERE bank_transaction_id = p_bank_transaction_id
  ) THEN
    RAISE EXCEPTION 'Transaction already included in a reconciliation';
  END IF;

  INSERT INTO public.reconciliation_lines (
    reconciliation_id, bank_transaction_id, ledger_entry_id, match_type, amount
  ) VALUES (
    p_reconciliation_id, p_bank_transaction_id, v_txn.matched_ledger_entry_id, 'auto', v_txn.amount
  ) RETURNING id INTO v_line_id;

  UPDATE public.bank_transactions
     SET status = 'RECONCILED', updated_at = now()
   WHERE id = p_bank_transaction_id;

  RETURN v_line_id;
END;
$$;

-- remove_reconciliation_line
CREATE OR REPLACE FUNCTION public.remove_reconciliation_line(
  p_line_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.reconciliations%ROWTYPE;
  v_txn_id uuid;
BEGIN
  SELECT r.* INTO v_rec
  FROM public.reconciliation_lines rl
  JOIN public.reconciliations r ON r.id = rl.reconciliation_id
  WHERE rl.id = p_line_id FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation line not found'; END IF;
  IF v_rec.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Reconciliation is not in progress (status=%)', v_rec.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_rec.organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  SELECT bank_transaction_id INTO v_txn_id FROM public.reconciliation_lines WHERE id = p_line_id;
  DELETE FROM public.reconciliation_lines WHERE id = p_line_id;

  -- Restore prior status (matched/posted)
  UPDATE public.bank_transactions
     SET status = CASE
       WHEN matched_ledger_entry_id IS NOT NULL THEN 'MATCHED'
       ELSE 'UNREVIEWED'
     END,
     updated_at = now()
   WHERE id = v_txn_id;
END;
$$;

-- complete_bank_reconciliation
CREATE OR REPLACE FUNCTION public.complete_bank_reconciliation(
  p_reconciliation_id uuid,
  p_force boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.reconciliations%ROWTYPE;
  v_sum numeric;
  v_expected numeric;
  v_diff numeric;
BEGIN
  SELECT * INTO v_rec FROM public.reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF v_rec.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Reconciliation already %', v_rec.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_rec.organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  PERFORM public.assert_no_locked_period_write(
    v_rec.organization_id, v_rec.client_id, v_rec.company_id, v_rec.statement_end_date
  );

  SELECT COALESCE(SUM(amount),0) INTO v_sum
  FROM public.reconciliation_lines WHERE reconciliation_id = p_reconciliation_id;

  v_expected := v_rec.statement_closing_balance - v_rec.statement_opening_balance;
  v_diff := v_expected - v_sum;

  IF ABS(v_diff) > 0.005 AND NOT p_force THEN
    RAISE EXCEPTION 'Reconciliation does not balance: expected movement %, lines sum %, difference %',
      v_expected, v_sum, v_diff;
  END IF;

  UPDATE public.reconciliations
     SET status = 'completed',
         completed_by = auth.uid(),
         completed_at = now(),
         difference = v_diff,
         updated_at = now()
   WHERE id = p_reconciliation_id;

  INSERT INTO public.bookkeeping_audit_log (
    organization_id, client_id, company_id, entity_type, entity_id, action, performed_by, metadata
  ) VALUES (
    v_rec.organization_id, v_rec.client_id, v_rec.company_id,
    'reconciliation', p_reconciliation_id, 'complete_bank_reconciliation', auth.uid(),
    jsonb_build_object(
      'expected_movement', v_expected,
      'lines_sum', v_sum,
      'difference', v_diff,
      'forced', p_force
    )
  );

  RETURN p_reconciliation_id;
END;
$$;

-- reopen_bank_reconciliation
CREATE OR REPLACE FUNCTION public.reopen_bank_reconciliation(
  p_reconciliation_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.reconciliations%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason (>= 5 chars) is required to reopen a reconciliation';
  END IF;

  SELECT * INTO v_rec FROM public.reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF v_rec.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed reconciliations can be reopened';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_rec.organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  PERFORM public.assert_no_locked_period_write(
    v_rec.organization_id, v_rec.client_id, v_rec.company_id, v_rec.statement_end_date
  );

  UPDATE public.reconciliations
     SET status = 'in_progress',
         reopened_by = auth.uid(),
         reopened_at = now(),
         reopen_reason = p_reason,
         completed_by = NULL,
         completed_at = NULL,
         updated_at = now()
   WHERE id = p_reconciliation_id;

  -- Revert RECONCILED txns back to MATCHED so they can be re-included
  UPDATE public.bank_transactions bt
     SET status = 'MATCHED', updated_at = now()
   FROM public.reconciliation_lines rl
   WHERE rl.reconciliation_id = p_reconciliation_id
     AND bt.id = rl.bank_transaction_id
     AND bt.status = 'RECONCILED';

  INSERT INTO public.bookkeeping_audit_log (
    organization_id, client_id, company_id, entity_type, entity_id, action, performed_by, metadata
  ) VALUES (
    v_rec.organization_id, v_rec.client_id, v_rec.company_id,
    'reconciliation', p_reconciliation_id, 'reopen_bank_reconciliation', auth.uid(),
    jsonb_build_object('reason', p_reason)
  );

  RETURN p_reconciliation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_bank_reconciliation(uuid, date, date, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_reconciliation_line(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_reconciliation_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_bank_reconciliation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_bank_reconciliation(uuid, text) TO authenticated;

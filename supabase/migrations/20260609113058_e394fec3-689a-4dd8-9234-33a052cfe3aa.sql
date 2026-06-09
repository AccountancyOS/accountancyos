
-- Add FX gain/loss account configuration to org_settings
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS fx_gain_account_id uuid REFERENCES public.bookkeeping_accounts(id),
  ADD COLUMN IF NOT EXISTS fx_loss_account_id uuid REFERENCES public.bookkeeping_accounts(id);

-- =====================================================================
-- revalue_bank_account_fx
-- Period-end FX revaluation of a foreign-currency bank account
-- =====================================================================
CREATE OR REPLACE FUNCTION public.revalue_bank_account_fx(
  p_bank_account_id uuid,
  p_revaluation_date date,
  p_fx_rate_to_base numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank record;
  v_org_settings record;
  v_base_currency text;
  v_gl_account_id uuid;
  v_txn_balance numeric := 0;     -- balance in transaction currency
  v_base_balance numeric := 0;    -- current GL balance in base currency
  v_revalued_base numeric;        -- revalued amount in base currency
  v_diff numeric;                 -- gain (>0) or loss (<0)
  v_journal_id uuid;
  v_fx_account uuid;
  v_user_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF p_fx_rate_to_base IS NULL OR p_fx_rate_to_base <= 0 THEN
    RAISE EXCEPTION 'Invalid FX rate' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_bank FROM public.bank_accounts WHERE id = p_bank_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  v_org_id := v_bank.organization_id;

  -- Org membership
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  -- Period lock guard
  PERFORM public.assert_no_locked_period_write(
    v_org_id, v_bank.client_id, v_bank.company_id, p_revaluation_date
  );

  v_gl_account_id := v_bank.account_id;
  IF v_gl_account_id IS NULL THEN
    RAISE EXCEPTION 'Bank account has no mapped GL account';
  END IF;

  SELECT * INTO v_org_settings FROM public.org_settings WHERE organization_id = v_org_id;
  v_base_currency := COALESCE(v_org_settings.base_currency, 'GBP');

  IF v_bank.currency = v_base_currency THEN
    RAISE EXCEPTION 'Bank account currency matches base currency; no FX revaluation needed';
  END IF;

  -- Aggregate balances on the GL bank account, scoped to entity
  SELECT
    COALESCE(SUM(COALESCE(le.transaction_debit, le.debit) - COALESCE(le.transaction_credit, le.credit)), 0),
    COALESCE(SUM(le.debit - le.credit), 0)
  INTO v_txn_balance, v_base_balance
  FROM public.ledger_entries le
  WHERE le.account_id = v_gl_account_id
    AND le.organization_id = v_org_id
    AND le.transaction_date <= p_revaluation_date
    AND (
      (v_bank.company_id IS NOT NULL AND le.company_id = v_bank.company_id) OR
      (v_bank.client_id IS NOT NULL AND le.client_id = v_bank.client_id)
    );

  v_revalued_base := ROUND(v_txn_balance * p_fx_rate_to_base, 2);
  v_diff := ROUND(v_revalued_base - v_base_balance, 2);

  IF ABS(v_diff) < 0.005 THEN
    RETURN jsonb_build_object(
      'success', true,
      'no_adjustment', true,
      'txn_balance', v_txn_balance,
      'base_balance', v_base_balance,
      'revalued_base', v_revalued_base
    );
  END IF;

  -- Determine FX account: gain if diff > 0, loss if diff < 0
  IF v_diff > 0 THEN
    v_fx_account := v_org_settings.fx_gain_account_id;
  ELSE
    v_fx_account := v_org_settings.fx_loss_account_id;
  END IF;
  IF v_fx_account IS NULL THEN
    RAISE EXCEPTION 'FX gain/loss account not configured in org_settings';
  END IF;

  -- Build journal: adjust bank GL by v_diff (base only, txn amount = 0)
  -- Debit bank / Credit FX gain  (when diff > 0)
  -- Credit bank / Debit FX loss  (when diff < 0)
  INSERT INTO public.journals (
    organization_id, client_id, company_id, journal_date, description,
    source_type, source_id, created_by
  ) VALUES (
    v_org_id, v_bank.client_id, v_bank.company_id, p_revaluation_date,
    COALESCE(p_reason, 'FX revaluation: ' || v_bank.name),
    'FX_REVALUATION', p_bank_account_id, v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Bank leg (base only)
  INSERT INTO public.journal_lines (journal_id, account_id, debit, credit, description)
  VALUES (
    v_journal_id, v_gl_account_id,
    GREATEST(v_diff, 0), GREATEST(-v_diff, 0),
    'FX revaluation adjustment'
  );

  -- FX gain/loss leg
  INSERT INTO public.journal_lines (journal_id, account_id, debit, credit, description)
  VALUES (
    v_journal_id, v_fx_account,
    GREATEST(-v_diff, 0), GREATEST(v_diff, 0),
    'FX revaluation ' || CASE WHEN v_diff > 0 THEN 'gain' ELSE 'loss' END
  );

  -- Post journal to ledger
  PERFORM public.post_to_ledger(v_journal_id);

  -- Audit log
  INSERT INTO public.bookkeeping_audit_log (
    organization_id, client_id, company_id, action, entity_type, entity_id, payload, performed_by
  ) VALUES (
    v_org_id, v_bank.client_id, v_bank.company_id,
    'fx_revaluation', 'bank_account', p_bank_account_id,
    jsonb_build_object(
      'revaluation_date', p_revaluation_date,
      'fx_rate', p_fx_rate_to_base,
      'txn_balance', v_txn_balance,
      'base_balance', v_base_balance,
      'revalued_base', v_revalued_base,
      'adjustment', v_diff,
      'journal_id', v_journal_id,
      'reason', p_reason
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'journal_id', v_journal_id,
    'adjustment', v_diff,
    'txn_balance', v_txn_balance,
    'base_balance_before', v_base_balance,
    'base_balance_after', v_revalued_base
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revalue_bank_account_fx(uuid, date, numeric, text) TO authenticated;

-- =====================================================================
-- check_bank_balance_integrity
-- Compares GL balance for the bank's mapped account vs sum of posted
-- bank transactions (MATCHED/RECONCILED) up to as_of_date.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_bank_balance_integrity(
  p_bank_account_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank record;
  v_gl_balance numeric := 0;
  v_txn_balance numeric := 0;
  v_unposted_count int := 0;
  v_user_id uuid := auth.uid();
BEGIN
  SELECT * INTO v_bank FROM public.bank_accounts WHERE id = p_bank_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank account not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_bank.organization_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  IF v_bank.account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No GL account mapped');
  END IF;

  -- GL balance (base currency) on the mapped account, entity-scoped
  SELECT COALESCE(SUM(le.debit - le.credit), 0)
  INTO v_gl_balance
  FROM public.ledger_entries le
  WHERE le.account_id = v_bank.account_id
    AND le.organization_id = v_bank.organization_id
    AND le.transaction_date <= p_as_of_date
    AND (
      (v_bank.company_id IS NOT NULL AND le.company_id = v_bank.company_id) OR
      (v_bank.client_id IS NOT NULL AND le.client_id = v_bank.client_id)
    );

  -- Posted bank transaction sum (status MATCHED or RECONCILED) in base currency
  SELECT
    COALESCE(SUM(COALESCE(bt.amount_base, bt.amount)), 0),
    COUNT(*) FILTER (WHERE bt.status IN ('UNREVIEWED', 'PENDING'))
  INTO v_txn_balance, v_unposted_count
  FROM public.bank_transactions bt
  WHERE bt.bank_account_id = p_bank_account_id
    AND bt.transaction_date <= p_as_of_date
    AND bt.status IN ('MATCHED', 'RECONCILED');

  RETURN jsonb_build_object(
    'success', true,
    'as_of_date', p_as_of_date,
    'gl_balance', v_gl_balance,
    'posted_txn_balance', v_txn_balance,
    'drift', ROUND(v_gl_balance - v_txn_balance, 2),
    'in_balance', ABS(v_gl_balance - v_txn_balance) < 0.005,
    'unposted_transactions', v_unposted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_bank_balance_integrity(uuid, date) TO authenticated;

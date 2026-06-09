
-- =============================================================================
-- PHASE 4 SLICE 5: split_bank_transaction
-- =============================================================================

CREATE OR REPLACE FUNCTION public.split_bank_transaction(
  p_bank_transaction_id UUID,
  p_splits JSONB  -- [{contra_account_id, vat_code_id, vat_amount, amount, description}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn RECORD;
  v_bank RECORD;
  v_settings RECORD;
  v_split JSONB;
  v_total NUMERIC := 0;
  v_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_contra UUID;
  v_vat_code UUID;
  v_desc TEXT;
  v_entries JSONB := '[]'::jsonb;
  v_money_in BOOLEAN;
  v_user_id UUID := auth.uid();
  v_post_result JSONB;
  v_before JSONB;
BEGIN
  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank transaction not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = v_user_id AND organization_id = v_txn.organization_id
  ) THEN
    RAISE EXCEPTION 'Not authorised for organization';
  END IF;

  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED') THEN
    RAISE EXCEPTION 'Transaction is already %', v_txn.status;
  END IF;

  PERFORM assert_no_locked_period_write(
    v_txn.organization_id, v_txn.client_id, v_txn.company_id, v_txn.transaction_date
  );

  IF jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) < 2 THEN
    RAISE EXCEPTION 'Splits must be an array with at least two entries';
  END IF;

  SELECT * INTO v_bank FROM public.bank_accounts WHERE id = v_txn.bank_account_id;
  IF NOT FOUND OR v_bank.account_id IS NULL THEN
    RAISE EXCEPTION 'Bank account not mapped to a ledger account';
  END IF;

  SELECT * INTO v_settings FROM public.org_settings
   WHERE organization_id = v_txn.organization_id LIMIT 1;

  v_money_in := v_txn.amount > 0;

  -- Validate splits + sum
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_amount := COALESCE((v_split->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Split amounts must be positive';
    END IF;
    IF NULLIF(v_split->>'contra_account_id','') IS NULL THEN
      RAISE EXCEPTION 'Each split must include a contra_account_id';
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  IF ROUND(v_total::numeric, 2) <> ROUND(ABS(v_txn.amount)::numeric, 2) THEN
    RAISE EXCEPTION 'Splits total (%) must equal transaction amount (%)',
      v_total, ABS(v_txn.amount);
  END IF;

  v_before := to_jsonb(v_txn);

  -- Bank leg (full amount, one line)
  IF v_money_in THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_txn.bank_account_id,
                         'debit', ABS(v_txn.amount), 'credit', 0,
                         'description', COALESCE(v_txn.description, 'Split receipt'))
    );
  ELSE
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_txn.bank_account_id,
                         'debit', 0, 'credit', ABS(v_txn.amount),
                         'description', COALESCE(v_txn.description, 'Split payment'))
    );
  END IF;

  -- Contra legs (one per split) + optional VAT legs
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_amount := (v_split->>'amount')::numeric;
    v_vat_amount := COALESCE(NULLIF(v_split->>'vat_amount','')::numeric, 0);
    v_contra := (v_split->>'contra_account_id')::uuid;
    v_vat_code := NULLIF(v_split->>'vat_code_id','')::uuid;
    v_desc := COALESCE(v_split->>'description', v_txn.description, 'Split');

    -- Net amount goes to the contra account; VAT (if any) routes to the VAT control account
    DECLARE
      v_net NUMERIC := v_amount - v_vat_amount;
    BEGIN
      IF v_money_in THEN
        v_entries := v_entries || jsonb_build_array(
          jsonb_build_object('account_id', v_contra, 'debit', 0, 'credit', v_net, 'description', v_desc)
        );
        IF v_vat_amount > 0 THEN
          IF v_settings.vat_control_account_id IS NULL THEN
            RAISE EXCEPTION 'VAT control account not configured in org_settings';
          END IF;
          v_entries := v_entries || jsonb_build_array(
            jsonb_build_object('account_id', v_settings.vat_control_account_id,
                               'debit', 0, 'credit', v_vat_amount,
                               'description', 'VAT: ' || v_desc,
                               'vat_code_id', v_vat_code)
          );
        END IF;
      ELSE
        v_entries := v_entries || jsonb_build_array(
          jsonb_build_object('account_id', v_contra, 'debit', v_net, 'credit', 0, 'description', v_desc)
        );
        IF v_vat_amount > 0 THEN
          IF v_settings.vat_control_account_id IS NULL THEN
            RAISE EXCEPTION 'VAT control account not configured in org_settings';
          END IF;
          v_entries := v_entries || jsonb_build_array(
            jsonb_build_object('account_id', v_settings.vat_control_account_id,
                               'debit', v_vat_amount, 'credit', 0,
                               'description', 'VAT: ' || v_desc,
                               'vat_code_id', v_vat_code)
          );
        END IF;
      END IF;
    END;
  END LOOP;

  v_post_result := public.post_to_ledger(
    p_organization_id := v_txn.organization_id,
    p_client_id       := v_txn.client_id,
    p_company_id      := v_txn.company_id,
    p_transaction_date:= v_txn.transaction_date,
    p_description     := 'Split: ' || LEFT(COALESCE(v_txn.description,''), 80),
    p_source_type     := 'BANK_TRANSACTION',
    p_source_id       := p_bank_transaction_id,
    p_entries         := v_entries
  );

  UPDATE public.bank_transactions
     SET status = 'MATCHED',
         matched_ledger_entry_id = (v_post_result->>'journal_id')::uuid
   WHERE id = p_bank_transaction_id;

  INSERT INTO public.bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id,
    before_state, after_state, metadata
  ) VALUES (
    v_txn.organization_id, 'bank_transaction', p_bank_transaction_id, 'split_bank_transaction', v_user_id,
    v_before,
    jsonb_build_object('status','MATCHED','journal_id', v_post_result->>'journal_id'),
    jsonb_build_object('splits', p_splits)
  );

  RETURN v_post_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_bank_transaction(UUID, JSONB) TO authenticated;

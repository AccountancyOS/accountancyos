
-- =============================================================================
-- PHASE 2: BANK POSTING THROUGH THE LEDGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.post_bank_transaction(
  p_bank_transaction_id uuid,
  p_contra_account_id uuid,
  p_vat_code_id uuid DEFAULT NULL,
  p_vat_amount numeric DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn record;
  v_bank record;
  v_bank_account_ledger_id uuid;
  v_vat_account_id uuid;
  v_org_settings record;
  v_amount numeric;
  v_gross numeric;
  v_net numeric;
  v_vat numeric;
  v_entries jsonb;
  v_result jsonb;
  v_journal_id uuid;
  v_actor uuid := auth.uid();
  v_is_receive boolean;
BEGIN
  -- Load transaction
  SELECT * INTO v_txn FROM bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'transaction_not_found',
                              'error_message', 'Bank transaction not found');
  END IF;

  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_matched',
                              'error_message', 'Transaction is already matched');
  END IF;

  -- Load bank account and its ledger account
  SELECT * INTO v_bank FROM bank_accounts WHERE id = v_txn.bank_account_id;
  IF NOT FOUND OR v_bank.account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'bank_account_unmapped',
                              'error_message', 'Bank account is not mapped to a ledger account');
  END IF;
  v_bank_account_ledger_id := v_bank.account_id;

  -- VAT split
  v_gross := abs(v_txn.amount);
  v_vat   := COALESCE(p_vat_amount, 0);
  IF v_vat < 0 OR v_vat > v_gross THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_vat_amount',
                              'error_message', 'VAT amount must be between zero and the gross amount');
  END IF;
  v_net := v_gross - v_vat;
  v_is_receive := v_txn.amount > 0;

  -- VAT control account (from org_settings)
  IF v_vat > 0 THEN
    SELECT * INTO v_org_settings FROM org_settings
      WHERE organization_id = v_txn.organization_id LIMIT 1;
    v_vat_account_id := v_org_settings.vat_control_account_id;
    IF v_vat_account_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'vat_control_not_set',
                                'error_message', 'VAT control account is not configured for this organisation');
    END IF;
  END IF;

  -- Build entries:
  --   RECEIVE: Dr Bank (gross), Cr Contra (net) [, Cr VAT (vat)]
  --   SPEND:   Dr Contra (net) [, Dr VAT (vat)], Cr Bank (gross)
  IF v_is_receive THEN
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_bank_account_ledger_id, 'debit', v_gross,
                         'description', COALESCE(p_description, v_txn.description)),
      jsonb_build_object('account_id', p_contra_account_id, 'credit', v_net,
                         'vat_code_id', p_vat_code_id,
                         'description', COALESCE(p_description, v_txn.description))
    );
    IF v_vat > 0 THEN
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account_id', v_vat_account_id, 'credit', v_vat,
                           'vat_code_id', p_vat_code_id,
                           'description', 'VAT on ' || COALESCE(p_description, v_txn.description))
      );
    END IF;
  ELSE
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', p_contra_account_id, 'debit', v_net,
                         'vat_code_id', p_vat_code_id,
                         'description', COALESCE(p_description, v_txn.description))
    );
    IF v_vat > 0 THEN
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object('account_id', v_vat_account_id, 'debit', v_vat,
                           'vat_code_id', p_vat_code_id,
                           'description', 'VAT on ' || COALESCE(p_description, v_txn.description))
      );
    END IF;
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_bank_account_ledger_id, 'credit', v_gross,
                         'description', COALESCE(p_description, v_txn.description))
    );
  END IF;

  v_result := post_to_ledger(
    v_txn.organization_id, v_txn.client_id, v_txn.company_id,
    v_txn.transaction_date,
    COALESCE(NULLIF(v_txn.description, ''), 'Bank transaction'),
    COALESCE(p_description, v_txn.description, 'Bank transaction'),
    CASE WHEN v_is_receive THEN 'BANK_RECEIVE' ELSE 'BANK_SPEND' END,
    'BANK_TRANSACTION', p_bank_transaction_id,
    COALESCE(v_txn.currency, 'GBP'), 1.0, v_actor, v_entries
  );

  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RETURN v_result;
  END IF;

  v_journal_id := (v_result->>'journal_id')::uuid;

  UPDATE bank_transactions
     SET status = 'MATCHED',
         matched_ledger_entry_id = (
           SELECT id FROM ledger_entries
            WHERE journal_id = v_journal_id AND account_id = v_bank_account_ledger_id
            LIMIT 1
         ),
         updated_at = now()
   WHERE id = p_bank_transaction_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_bank_transaction(uuid, uuid, uuid, numeric, text)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.post_bank_transfer(
  p_source_transaction_id uuid,
  p_destination_bank_account_id uuid,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn record;
  v_src record;
  v_dst record;
  v_entries jsonb;
  v_result jsonb;
  v_actor uuid := auth.uid();
  v_amount numeric;
BEGIN
  SELECT * INTO v_txn FROM bank_transactions WHERE id = p_source_transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'transaction_not_found',
                              'error_message', 'Bank transaction not found');
  END IF;
  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_matched',
                              'error_message', 'Transaction is already matched');
  END IF;

  SELECT * INTO v_src FROM bank_accounts WHERE id = v_txn.bank_account_id;
  SELECT * INTO v_dst FROM bank_accounts WHERE id = p_destination_bank_account_id;
  IF v_src IS NULL OR v_dst IS NULL OR v_src.account_id IS NULL OR v_dst.account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'bank_account_unmapped',
                              'error_message', 'Source or destination bank account is unmapped');
  END IF;
  IF v_src.organization_id <> v_dst.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cross_org_transfer',
                              'error_message', 'Transfers across organisations are not permitted');
  END IF;

  v_amount := abs(v_txn.amount);

  -- If source amount is negative (money out), src is source; otherwise reverse.
  IF v_txn.amount < 0 THEN
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_dst.account_id, 'debit',  v_amount,
                         'description', COALESCE(p_description, 'Transfer to ' || v_dst.name)),
      jsonb_build_object('account_id', v_src.account_id, 'credit', v_amount,
                         'description', COALESCE(p_description, 'Transfer from ' || v_src.name))
    );
  ELSE
    v_entries := jsonb_build_array(
      jsonb_build_object('account_id', v_src.account_id, 'debit',  v_amount,
                         'description', COALESCE(p_description, 'Transfer into ' || v_src.name)),
      jsonb_build_object('account_id', v_dst.account_id, 'credit', v_amount,
                         'description', COALESCE(p_description, 'Transfer out of ' || v_dst.name))
    );
  END IF;

  v_result := post_to_ledger(
    v_txn.organization_id, v_txn.client_id, v_txn.company_id,
    v_txn.transaction_date,
    'Bank transfer',
    COALESCE(p_description, 'Bank transfer'),
    'BANK_TRANSFER',
    'BANK_TRANSACTION', p_source_transaction_id,
    COALESCE(v_txn.currency, 'GBP'), 1.0, v_actor, v_entries
  );

  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RETURN v_result;
  END IF;

  UPDATE bank_transactions
     SET status = 'MATCHED', updated_at = now()
   WHERE id = p_source_transaction_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_bank_transfer(uuid, uuid, text)
  TO authenticated, service_role;

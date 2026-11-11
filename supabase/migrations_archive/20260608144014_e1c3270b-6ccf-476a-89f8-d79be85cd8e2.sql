
-- =============================================================================
-- PHASE 2 SLICE 3: BANK RULES VIA HARDENED RPC
-- Routes rule application through post_to_ledger and records execution atomically
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_bank_rule(
  p_bank_transaction_id uuid,
  p_rule_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn record;
  v_rule record;
  v_bank record;
  v_actions jsonb;
  v_action jsonb;
  v_account_id uuid;
  v_vat_code_id uuid;
  v_category text;
  v_post_result jsonb;
  v_actor uuid := auth.uid();
BEGIN
  -- Load transaction
  SELECT * INTO v_txn FROM bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'transaction_not_found',
                              'error_message', 'Bank transaction not found');
  END IF;
  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED','CATEGORIZED') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_categorized',
                              'error_message', 'Transaction is already categorised');
  END IF;

  -- Load rule (and validate organisation match)
  SELECT * INTO v_rule FROM bank_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rule_not_found',
                              'error_message', 'Bank rule not found');
  END IF;
  IF v_rule.organization_id <> v_txn.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'org_mismatch',
                              'error_message', 'Rule and transaction belong to different organisations');
  END IF;
  IF v_rule.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rule_inactive',
                              'error_message', 'Rule is not active');
  END IF;

  -- Parse actions
  v_actions := COALESCE(v_rule.actions, '[]'::jsonb);
  FOR v_action IN SELECT * FROM jsonb_array_elements(v_actions) LOOP
    IF v_action->>'type' = 'set_account' THEN
      v_account_id := NULLIF(v_action->>'value','')::uuid;
    ELSIF v_action->>'type' = 'set_vat_code' THEN
      v_vat_code_id := NULLIF(v_action->>'value','')::uuid;
    ELSIF v_action->>'type' = 'set_category' THEN
      v_category := v_action->>'value';
    END IF;
  END LOOP;

  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_account_action',
                              'error_message', 'Rule must define a set_account action');
  END IF;

  -- Load bank GL account
  SELECT * INTO v_bank FROM bank_accounts WHERE id = v_txn.bank_account_id;
  IF NOT FOUND OR v_bank.account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'bank_account_unmapped',
                              'error_message', 'Bank account is not mapped to a ledger account');
  END IF;

  -- Route through the hardened post_bank_transaction RPC (single ledger path)
  v_post_result := post_bank_transaction(
    p_bank_transaction_id := p_bank_transaction_id,
    p_contra_account_id   := v_account_id,
    p_vat_code_id         := v_vat_code_id,
    p_vat_amount          := 0,
    p_description         := COALESCE(v_txn.description, v_rule.rule_name)
  );

  IF v_post_result IS NULL OR (v_post_result->>'success')::boolean IS DISTINCT FROM true THEN
    -- Record failed execution
    INSERT INTO bank_rule_executions(
      organization_id, bank_rule_id, bank_transaction_id, executed_by,
      matched_conditions, applied_actions, result
    ) VALUES (
      v_txn.organization_id, p_rule_id, p_bank_transaction_id, v_actor,
      v_rule.conditions, v_rule.actions, 'failed'
    );
    RETURN v_post_result;
  END IF;

  -- Apply rule metadata + category to transaction
  UPDATE bank_transactions
     SET rule_id  = p_rule_id,
         category = COALESCE(v_category, category),
         status   = 'MATCHED'
   WHERE id = p_bank_transaction_id;

  -- Record successful execution
  INSERT INTO bank_rule_executions(
    organization_id, bank_rule_id, bank_transaction_id, executed_by,
    matched_conditions, applied_actions, result
  ) VALUES (
    v_txn.organization_id, p_rule_id, p_bank_transaction_id, v_actor,
    v_rule.conditions, v_rule.actions, 'success'
  );

  -- Update rule stats
  UPDATE bank_rules
     SET times_applied = COALESCE(times_applied, 0) + 1,
         last_applied_at = now()
   WHERE id = p_rule_id;

  RETURN v_post_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bank_rule(uuid, uuid) TO authenticated;

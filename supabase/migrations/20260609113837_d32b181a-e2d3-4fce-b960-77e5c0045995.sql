-- ============================================================
-- PHASE 4 SLICE 8: Bank rules execution hardening
-- ============================================================

-- 1) Re-create apply_bank_rule with row-level lock for concurrency safety
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
  v_before jsonb;
  v_actor uuid := auth.uid();
  v_is_member boolean;
BEGIN
  -- Lock the transaction row to serialise concurrent rule applications
  SELECT * INTO v_txn FROM bank_transactions
    WHERE id = p_bank_transaction_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'transaction_not_found',
                              'error_message', 'Bank transaction not found');
  END IF;

  SELECT user_in_organization(v_actor, v_txn.organization_id) INTO v_is_member;
  IF NOT COALESCE(v_is_member, false) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden',
                              'error_message', 'Only accountants in this organisation can apply bank rules');
  END IF;

  IF upper(COALESCE(v_txn.status,'')) IN ('MATCHED','RECONCILED','CATEGORIZED') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_categorized',
                              'error_message', 'Transaction is already categorised');
  END IF;

  BEGIN
    PERFORM assert_no_locked_period_write(
      v_txn.organization_id, v_txn.client_id, v_txn.company_id, v_txn.transaction_date
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'period_locked',
                              'error_message', SQLERRM);
  END;

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
  IF v_rule.client_id IS NOT NULL AND v_rule.client_id IS DISTINCT FROM v_txn.client_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'scope_mismatch',
                              'error_message', 'Rule is scoped to a different client');
  END IF;
  IF v_rule.company_id IS NOT NULL AND v_rule.company_id IS DISTINCT FROM v_txn.company_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'scope_mismatch',
                              'error_message', 'Rule is scoped to a different company');
  END IF;
  IF v_rule.bank_account_id IS NOT NULL AND v_rule.bank_account_id IS DISTINCT FROM v_txn.bank_account_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'bank_account_mismatch',
                              'error_message', 'Rule is scoped to a different bank account');
  END IF;

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

  SELECT * INTO v_bank FROM bank_accounts WHERE id = v_txn.bank_account_id;
  IF NOT FOUND OR v_bank.organization_id <> v_txn.organization_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'bank_account_invalid',
                              'error_message', 'Bank account not found or not in this organisation');
  END IF;

  v_before := to_jsonb(v_txn);

  -- REVIEW MODE: stage suggestion only, do not post.
  IF v_rule.requires_review OR NOT v_rule.auto_post THEN
    UPDATE bank_transactions
       SET rule_id = p_rule_id,
           category = COALESCE(v_category, category),
           client_suggested_account_id = v_account_id,
           review_status = 'pending'::bk_review_status,
           status = 'PENDING_REVIEW'
     WHERE id = p_bank_transaction_id;

    INSERT INTO bank_rule_executions(
      organization_id, bank_rule_id, bank_transaction_id, executed_by,
      matched_conditions, applied_actions, result
    ) VALUES (
      v_txn.organization_id, p_rule_id, p_bank_transaction_id, v_actor,
      v_rule.conditions, v_rule.actions, 'pending_review'
    );

    INSERT INTO bookkeeping_audit_log(
      organization_id, entity_type, entity_id, action, actor_id,
      before_state, after_state, metadata
    ) VALUES (
      v_txn.organization_id, 'bank_transaction', p_bank_transaction_id, 'apply_bank_rule_suggested', v_actor,
      v_before,
      jsonb_build_object('suggested_account_id', v_account_id, 'rule_id', p_rule_id,
                         'category', v_category, 'status', 'PENDING_REVIEW'),
      jsonb_build_object('rule_source', v_rule.source, 'vat_sensitive', v_rule.vat_sensitive)
    );

    UPDATE bank_rules
       SET times_applied = COALESCE(times_applied, 0) + 1,
           last_applied_at = now()
     WHERE id = p_rule_id;

    RETURN jsonb_build_object('success', true, 'mode', 'review',
                              'message', 'Rule staged for accountant review');
  END IF;

  -- AUTO-POST MODE
  v_post_result := post_bank_transaction(
    p_bank_transaction_id := p_bank_transaction_id,
    p_contra_account_id   := v_account_id,
    p_vat_code_id         := v_vat_code_id,
    p_vat_amount          := 0,
    p_description         := COALESCE(v_txn.description, v_rule.rule_name)
  );

  IF v_post_result IS NULL OR (v_post_result->>'success')::boolean IS DISTINCT FROM true THEN
    INSERT INTO bank_rule_executions(
      organization_id, bank_rule_id, bank_transaction_id, executed_by,
      matched_conditions, applied_actions, result, error_message
    ) VALUES (
      v_txn.organization_id, p_rule_id, p_bank_transaction_id, v_actor,
      v_rule.conditions, v_rule.actions, 'failed',
      COALESCE(v_post_result->>'error_message', v_post_result->>'error', 'unknown')
    );
    INSERT INTO bookkeeping_audit_log(
      organization_id, entity_type, entity_id, action, actor_id,
      before_state, after_state, metadata
    ) VALUES (
      v_txn.organization_id, 'bank_transaction', p_bank_transaction_id, 'apply_bank_rule_failed', v_actor,
      v_before, NULL,
      jsonb_build_object('rule_id', p_rule_id, 'error', v_post_result)
    );
    RETURN v_post_result;
  END IF;

  UPDATE bank_transactions
     SET rule_id = p_rule_id,
         category = COALESCE(v_category, category),
         status = 'MATCHED'
   WHERE id = p_bank_transaction_id;

  INSERT INTO bank_rule_executions(
    organization_id, bank_rule_id, bank_transaction_id, executed_by,
    matched_conditions, applied_actions, result
  ) VALUES (
    v_txn.organization_id, p_rule_id, p_bank_transaction_id, v_actor,
    v_rule.conditions, v_rule.actions, 'success'
  );

  UPDATE bank_rules
     SET times_applied = COALESCE(times_applied, 0) + 1,
         last_applied_at = now()
   WHERE id = p_rule_id;

  INSERT INTO bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id,
    before_state, after_state, metadata
  ) VALUES (
    v_txn.organization_id, 'bank_transaction', p_bank_transaction_id, 'apply_bank_rule', v_actor,
    v_before,
    jsonb_build_object('rule_id', p_rule_id, 'account_id', v_account_id,
                       'vat_code_id', v_vat_code_id, 'category', v_category, 'status', 'MATCHED'),
    jsonb_build_object('post_result', v_post_result, 'rule_source', v_rule.source)
  );

  RETURN v_post_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bank_rule(uuid, uuid) TO authenticated;


-- 2) bulk_apply_active_bank_rules: server-side bulk application
CREATE OR REPLACE FUNCTION public.bulk_apply_active_bank_rules(
  p_organization_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_limit int DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_member boolean;
  v_txn record;
  v_rule record;
  v_applied int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_result jsonb;
  v_matches boolean;
BEGIN
  IF p_client_id IS NULL AND p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_entity',
                              'error_message', 'Either client_id or company_id is required');
  END IF;

  SELECT user_in_organization(v_actor, p_organization_id) INTO v_is_member;
  IF NOT COALESCE(v_is_member, false) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden',
                              'error_message', 'Not a member of this organisation');
  END IF;

  FOR v_txn IN
    SELECT * FROM bank_transactions
     WHERE organization_id = p_organization_id
       AND (p_client_id IS NULL OR client_id = p_client_id)
       AND (p_company_id IS NULL OR company_id = p_company_id)
       AND (p_bank_account_id IS NULL OR bank_account_id = p_bank_account_id)
       AND upper(COALESCE(status,'')) = 'UNREVIEWED'
     ORDER BY transaction_date ASC
     LIMIT p_limit
  LOOP
    FOR v_rule IN
      SELECT * FROM bank_rules
       WHERE organization_id = p_organization_id
         AND is_active = true
         AND (client_id IS NULL OR client_id = v_txn.client_id)
         AND (company_id IS NULL OR company_id = v_txn.company_id)
         AND (bank_account_id IS NULL OR bank_account_id = v_txn.bank_account_id)
       ORDER BY priority ASC, created_at ASC
    LOOP
      -- Delegate conditions check to apply_bank_rule (it validates scope);
      -- here we just attempt application and accept first success.
      v_result := apply_bank_rule(v_txn.id, v_rule.id);
      IF (v_result->>'success')::boolean IS TRUE THEN
        v_applied := v_applied + 1;
        EXIT;
      ELSIF v_result->>'error_code' IN ('already_categorized','period_locked') THEN
        v_skipped := v_skipped + 1;
        EXIT;
      ELSE
        -- Try next rule for non-fatal mismatch errors
        IF v_result->>'error_code' NOT IN ('scope_mismatch','bank_account_mismatch','rule_inactive') THEN
          v_failed := v_failed + 1;
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true,
                            'applied', v_applied,
                            'skipped', v_skipped,
                            'failed', v_failed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_apply_active_bank_rules(uuid, uuid, uuid, uuid, int) TO authenticated;


-- 3) revert_bank_rule_application: undo previously applied rule
CREATE OR REPLACE FUNCTION public.revert_bank_rule_application(
  p_bank_transaction_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_txn record;
  v_is_member boolean;
  v_journal_id uuid;
  v_before jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'reason_required',
                              'error_message', 'A reason of at least 5 characters is required');
  END IF;

  SELECT * INTO v_txn FROM bank_transactions WHERE id = p_bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'transaction_not_found',
                              'error_message', 'Bank transaction not found');
  END IF;

  SELECT user_in_organization(v_actor, v_txn.organization_id) INTO v_is_member;
  IF NOT COALESCE(v_is_member, false) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden',
                              'error_message', 'Not a member of this organisation');
  END IF;

  IF v_txn.rule_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_rule_applied',
                              'error_message', 'Transaction has no rule application to revert');
  END IF;

  IF upper(COALESCE(v_txn.status,'')) = 'RECONCILED' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'reconciled',
                              'error_message', 'Cannot revert a reconciled transaction; reopen the reconciliation first');
  END IF;

  BEGIN
    PERFORM assert_no_locked_period_write(
      v_txn.organization_id, v_txn.client_id, v_txn.company_id, v_txn.transaction_date
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'period_locked',
                              'error_message', SQLERRM);
  END;

  v_before := to_jsonb(v_txn);

  -- If a journal was posted, reverse it via existing helper if available
  SELECT id INTO v_journal_id FROM journals
   WHERE source_type = 'bank_transaction'
     AND source_id = p_bank_transaction_id
     AND COALESCE(is_reversed, false) = false
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_journal_id IS NOT NULL THEN
    BEGIN
      PERFORM reverse_journal(v_journal_id, p_reason);
    EXCEPTION WHEN undefined_function THEN
      UPDATE journals SET is_reversed = true, reversed_at = now(), reversed_by = v_actor,
                          reversal_reason = p_reason
       WHERE id = v_journal_id;
    END;
  END IF;

  UPDATE bank_transactions
     SET status = 'UNREVIEWED',
         rule_id = NULL,
         category = NULL,
         client_suggested_account_id = NULL,
         review_status = NULL
   WHERE id = p_bank_transaction_id;

  INSERT INTO bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id,
    before_state, after_state, metadata
  ) VALUES (
    v_txn.organization_id, 'bank_transaction', p_bank_transaction_id,
    'revert_bank_rule_application', v_actor,
    v_before,
    jsonb_build_object('status','UNREVIEWED'),
    jsonb_build_object('reason', p_reason, 'reversed_journal_id', v_journal_id)
  );

  RETURN jsonb_build_object('success', true, 'reversed_journal_id', v_journal_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_bank_rule_application(uuid, text) TO authenticated;
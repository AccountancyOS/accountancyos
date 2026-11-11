
-- =============================================================================
-- PHASE 4 SLICE 3: Bank rule safety model
-- =============================================================================

ALTER TABLE public.bank_rules
  ADD COLUMN IF NOT EXISTS auto_post boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS vat_sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.bank_rules
  DROP CONSTRAINT IF EXISTS bank_rules_source_check;
ALTER TABLE public.bank_rules
  ADD CONSTRAINT bank_rules_source_check
  CHECK (source IN ('accountant','portal','system'));

-- Trigger: enforce portal safety + auto-derive vat_sensitive
CREATE OR REPLACE FUNCTION public.bank_rule_safety_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action jsonb;
  v_has_vat boolean := false;
BEGIN
  -- Detect VAT sensitivity from actions
  IF NEW.actions IS NOT NULL THEN
    FOR v_action IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.actions,'[]'::jsonb)) LOOP
      IF v_action->>'type' = 'set_vat_code' AND COALESCE(v_action->>'value','') <> '' THEN
        v_has_vat := true;
      END IF;
    END LOOP;
  END IF;
  NEW.vat_sensitive := v_has_vat;

  -- Portal-created rules can never auto-post and always require review
  IF NEW.source = 'portal' THEN
    NEW.auto_post := false;
    NEW.requires_review := true;
  END IF;

  -- VAT-sensitive rules default to requires_review unless caller explicitly
  -- set auto_post = true (accountant-confirmed automation).
  IF v_has_vat AND TG_OP = 'INSERT' AND NEW.auto_post IS NOT TRUE THEN
    NEW.requires_review := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_rule_safety_guard ON public.bank_rules;
CREATE TRIGGER trg_bank_rule_safety_guard
  BEFORE INSERT OR UPDATE ON public.bank_rules
  FOR EACH ROW EXECUTE FUNCTION public.bank_rule_safety_guard();

-- Update apply_bank_rule to honour requires_review / auto_post
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
  SELECT * INTO v_txn FROM bank_transactions WHERE id = p_bank_transaction_id;
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

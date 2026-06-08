
-- =============================================================================
-- PHASE 1: LEDGER ENFORCEMENT GATE
-- =============================================================================

-- 1. Per-entity control account pointers on org_settings ------------------------
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS accounts_receivable_account_id uuid,
  ADD COLUMN IF NOT EXISTS accounts_payable_account_id uuid,
  ADD COLUMN IF NOT EXISTS vat_control_account_id uuid,
  ADD COLUMN IF NOT EXISTS bank_charges_account_id uuid,
  ADD COLUMN IF NOT EXISTS opening_balance_equity_account_id uuid,
  ADD COLUMN IF NOT EXISTS retained_earnings_account_id uuid,
  ADD COLUMN IF NOT EXISTS suspense_account_id uuid,
  ADD COLUMN IF NOT EXISTS director_loan_account_id uuid,
  ADD COLUMN IF NOT EXISTS fixed_assets_account_id uuid,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_id uuid;

-- 2. HARDENED post_to_ledger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_to_ledger(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_journal_date date,
  p_reference text,
  p_description text,
  p_journal_type text,
  p_source_type text,
  p_source_id uuid,
  p_currency text DEFAULT 'GBP',
  p_fx_rate numeric DEFAULT 1.0,
  p_created_by uuid DEFAULT NULL,
  p_entries jsonb DEFAULT '[]'::jsonb,
  p_lock_override_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_journal_id uuid;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_entry jsonb;
  v_line_number int := 0;
  v_ledger_ids uuid[] := '{}';
  v_ledger_id uuid;
  v_lock_date date;
  v_actor uuid := COALESCE(p_created_by, auth.uid());
  v_is_admin boolean;
  v_account_record record;
  v_dup_count int;
  v_err_code text;
  v_err_msg text;
  v_entity_type text;
  v_entity_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_account_id uuid;
  v_allow_duplicate_sources text[] :=
    ARRAY['JOURNAL','REVERSAL','PAYMENT','CREDIT_NOTE','VAT_ADJUSTMENT','OPENING_BALANCE_REVERSAL'];
BEGIN
  -- ---- Header validations ---------------------------------------------------
  IF p_organization_id IS NULL THEN
    v_err_code := 'missing_organization'; v_err_msg := 'organization_id is required';
    PERFORM 1; RAISE EXCEPTION '%', v_err_msg;
  END IF;

  IF (p_client_id IS NULL AND p_company_id IS NULL)
     OR (p_client_id IS NOT NULL AND p_company_id IS NOT NULL) THEN
    v_err_code := 'invalid_entity_scope';
    v_err_msg  := 'Exactly one of client_id or company_id must be provided';
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  v_entity_type := CASE WHEN p_client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(p_client_id, p_company_id);

  -- caller must belong to organization (defense in depth; RPC is SECURITY DEFINER)
  IF v_actor IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM organization_users
       WHERE organization_id = p_organization_id AND user_id = v_actor
     ) THEN
    v_err_code := 'cross_tenant';
    v_err_msg  := 'Caller is not a member of the target organization';
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  IF jsonb_array_length(COALESCE(p_entries, '[]'::jsonb)) < 2 THEN
    v_err_code := 'insufficient_lines';
    v_err_msg  := 'At least two ledger lines are required';
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  -- ---- Line validations + totals -------------------------------------------
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_account_id := (v_entry->>'account_id')::uuid;
    v_debit  := COALESCE((v_entry->>'debit')::numeric,  0);
    v_credit := COALESCE((v_entry->>'credit')::numeric, 0);

    IF v_account_id IS NULL THEN
      v_err_code := 'missing_account';
      v_err_msg  := 'Every line requires account_id';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    IF v_debit < 0 OR v_credit < 0 THEN
      v_err_code := 'negative_amount';
      v_err_msg  := 'Negative debit or credit values are not permitted';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    IF (v_debit > 0 AND v_credit > 0) OR (v_debit = 0 AND v_credit = 0) THEN
      v_err_code := 'invalid_line';
      v_err_msg  := 'Each line must have exactly one of debit or credit set';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    SELECT id, organization_id, client_id, company_id, is_active, is_system_account
      INTO v_account_record
      FROM bookkeeping_accounts
     WHERE id = v_account_id;

    IF NOT FOUND THEN
      v_err_code := 'account_not_found';
      v_err_msg  := format('Account %s does not exist', v_account_id);
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    IF v_account_record.organization_id <> p_organization_id THEN
      v_err_code := 'account_scope_mismatch';
      v_err_msg  := 'Account belongs to a different organization';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    -- system accounts (org-scoped templates) may have null entity; entity-specific must match
    IF v_account_record.client_id IS NOT NULL
       AND v_account_record.client_id IS DISTINCT FROM p_client_id THEN
      v_err_code := 'account_scope_mismatch';
      v_err_msg  := 'Account is scoped to a different client';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;
    IF v_account_record.company_id IS NOT NULL
       AND v_account_record.company_id IS DISTINCT FROM p_company_id THEN
      v_err_code := 'account_scope_mismatch';
      v_err_msg  := 'Account is scoped to a different company';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    IF COALESCE(v_account_record.is_active, true) = false THEN
      v_err_code := 'account_inactive';
      v_err_msg  := 'Posting to an inactive account is not permitted';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    v_total_debit  := v_total_debit  + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    v_err_code := 'unbalanced';
    v_err_msg  := format('Journal is unbalanced: debits %s != credits %s',
                         v_total_debit, v_total_credit);
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  -- ---- Period lock enforcement ---------------------------------------------
  SELECT MAX(lock_date) INTO v_lock_date
    FROM period_locks
   WHERE organization_id = p_organization_id
     AND ((p_client_id  IS NOT NULL AND client_id  = p_client_id)
       OR (p_company_id IS NOT NULL AND company_id = p_company_id));

  IF v_lock_date IS NOT NULL AND p_journal_date <= v_lock_date THEN
    IF p_lock_override_reason IS NULL
       OR length(btrim(p_lock_override_reason)) = 0 THEN
      v_err_code := 'period_locked';
      v_err_msg  := format('Period is locked through %s; override reason required', v_lock_date);
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    SELECT (has_organization_role(p_organization_id, 'owner')
         OR has_organization_role(p_organization_id, 'admin'))
      INTO v_is_admin;

    IF NOT COALESCE(v_is_admin, false) THEN
      v_err_code := 'period_locked_no_role';
      v_err_msg  := 'Only owners/admins may override a locked period';
      RAISE EXCEPTION '%', v_err_msg;
    END IF;

    INSERT INTO bookkeeping_audit_log
      (organization_id, entity_type, entity_id, action, actor_id, reason, metadata)
    VALUES (p_organization_id, v_entity_type, v_entity_id, 'period_lock_override',
            v_actor, p_lock_override_reason,
            jsonb_build_object('journal_date', p_journal_date, 'lock_date', v_lock_date,
                               'source_type', p_source_type, 'source_id', p_source_id));
  END IF;

  -- ---- Duplicate-source guard ----------------------------------------------
  IF p_source_id IS NOT NULL
     AND NOT (upper(COALESCE(p_source_type,'')) = ANY (v_allow_duplicate_sources)) THEN
    SELECT count(*) INTO v_dup_count
      FROM journals
     WHERE organization_id = p_organization_id
       AND ((p_client_id IS NOT NULL AND client_id = p_client_id)
         OR (p_company_id IS NOT NULL AND company_id = p_company_id))
       AND id IN (
         SELECT journal_id FROM ledger_entries
          WHERE source_type = p_source_type AND source_id = p_source_id
       );

    IF v_dup_count > 0 THEN
      v_err_code := 'duplicate_source';
      v_err_msg  := format('Source %s/%s already posted', p_source_type, p_source_id);
      RAISE EXCEPTION '%', v_err_msg;
    END IF;
  END IF;

  -- ---- Persist journal + lines + ledger entries ----------------------------
  INSERT INTO journals
    (organization_id, client_id, company_id, journal_date, reference, description,
     journal_type, total_debit, total_credit, transaction_currency, fx_rate_to_base,
     is_posted, posted_at, created_by)
  VALUES
    (p_organization_id, p_client_id, p_company_id, p_journal_date, p_reference, p_description,
     p_journal_type, v_total_debit, v_total_credit, p_currency, p_fx_rate,
     true, now(), v_actor)
  RETURNING id INTO v_journal_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_line_number := v_line_number + 1;
    v_debit  := NULLIF(COALESCE((v_entry->>'debit')::numeric,  0), 0);
    v_credit := NULLIF(COALESCE((v_entry->>'credit')::numeric, 0), 0);

    INSERT INTO journal_lines
      (journal_id, line_number, account_id, debit, credit, vat_code_id, description)
    VALUES
      (v_journal_id, v_line_number, (v_entry->>'account_id')::uuid,
       v_debit, v_credit, (v_entry->>'vat_code_id')::uuid, v_entry->>'description');

    INSERT INTO ledger_entries
      (organization_id, client_id, company_id, transaction_date, entry_date,
       account_id, debit, credit, description, reference, journal_id,
       source_type, source_id, vat_code_id, transaction_currency,
       transaction_debit, transaction_credit, fx_rate_to_base, base_currency, created_by)
    VALUES
      (p_organization_id, p_client_id, p_company_id, p_journal_date, p_journal_date,
       (v_entry->>'account_id')::uuid,
       CASE WHEN v_debit  IS NULL THEN NULL ELSE v_debit  * p_fx_rate END,
       CASE WHEN v_credit IS NULL THEN NULL ELSE v_credit * p_fx_rate END,
       v_entry->>'description', p_reference, v_journal_id,
       p_source_type, p_source_id, (v_entry->>'vat_code_id')::uuid, p_currency,
       v_debit, v_credit, p_fx_rate, 'GBP', v_actor)
    RETURNING id INTO v_ledger_id;
    v_ledger_ids := v_ledger_ids || v_ledger_id;
  END LOOP;

  INSERT INTO bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, after_state, metadata)
  VALUES
    (p_organization_id, v_entity_type, v_entity_id, 'ledger_post', v_actor,
     jsonb_build_object('journal_id', v_journal_id, 'total_debit', v_total_debit,
                        'total_credit', v_total_credit, 'line_count', v_line_number),
     jsonb_build_object('source_type', p_source_type, 'source_id', p_source_id,
                        'journal_type', p_journal_type, 'idempotency_key', p_idempotency_key));

  RETURN jsonb_build_object('success', true,
                            'journal_id', v_journal_id,
                            'ledger_entry_ids', to_jsonb(v_ledger_ids));

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO bookkeeping_audit_log
      (organization_id, entity_type, entity_id, action, actor_id, reason, metadata)
    VALUES
      (COALESCE(p_organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
       COALESCE(v_entity_type, 'unknown'),
       COALESCE(v_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
       'ledger_post_blocked', v_actor,
       COALESCE(v_err_msg, SQLERRM),
       jsonb_build_object('error_code', COALESCE(v_err_code, 'unknown'),
                          'source_type', p_source_type,
                          'source_id',   p_source_id,
                          'journal_date', p_journal_date));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('success', false,
                            'error_code',    COALESCE(v_err_code, 'unknown'),
                            'error_message', COALESCE(v_err_msg, SQLERRM));
END;
$func$;

GRANT EXECUTE ON FUNCTION public.post_to_ledger(
  uuid, uuid, uuid, date, text, text, text, text, uuid, text, numeric, uuid, jsonb, text, text
) TO authenticated, service_role;

-- 3. Trial Balance + General Ledger read RPCs (ledger-only) --------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance_from_ledger(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  opening_balance numeric,
  period_debit numeric,
  period_credit numeric,
  closing_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT a.id   AS account_id,
           a.code AS account_code,
           a.name AS account_name,
           a.account_type,
           le.transaction_date,
           COALESCE(le.debit,  0) AS d,
           COALESCE(le.credit, 0) AS c
      FROM ledger_entries le
      JOIN bookkeeping_accounts a ON a.id = le.account_id
     WHERE le.organization_id = p_organization_id
       AND (
            (p_client_id  IS NOT NULL AND le.client_id  = p_client_id) OR
            (p_company_id IS NOT NULL AND le.company_id = p_company_id)
       )
       AND le.transaction_date <= p_period_end
  )
  SELECT account_id,
         account_code,
         account_name,
         account_type,
         SUM(CASE WHEN transaction_date < p_period_start THEN d - c ELSE 0 END)::numeric AS opening_balance,
         SUM(CASE WHEN transaction_date BETWEEN p_period_start AND p_period_end THEN d ELSE 0 END)::numeric AS period_debit,
         SUM(CASE WHEN transaction_date BETWEEN p_period_start AND p_period_end THEN c ELSE 0 END)::numeric AS period_credit,
         SUM(d - c)::numeric AS closing_balance
    FROM base
   GROUP BY account_id, account_code, account_name, account_type
   ORDER BY account_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_trial_balance_from_ledger(uuid, uuid, uuid, date, date)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_general_ledger_from_ledger(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_account_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  ledger_entry_id uuid,
  transaction_date date,
  reference text,
  description text,
  source_type text,
  source_id uuid,
  journal_id uuid,
  debit numeric,
  credit numeric,
  running_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT le.id,
         le.transaction_date,
         le.reference,
         le.description,
         le.source_type,
         le.source_id,
         le.journal_id,
         le.debit,
         le.credit,
         SUM(COALESCE(le.debit,0) - COALESCE(le.credit,0))
           OVER (ORDER BY le.transaction_date, le.created_at, le.id) AS running_balance
    FROM ledger_entries le
   WHERE le.organization_id = p_organization_id
     AND (p_account_id IS NULL OR le.account_id = p_account_id)
     AND (
          (p_client_id  IS NOT NULL AND le.client_id  = p_client_id) OR
          (p_company_id IS NOT NULL AND le.company_id = p_company_id)
     )
     AND le.transaction_date BETWEEN p_period_start AND p_period_end
   ORDER BY le.transaction_date, le.created_at, le.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_general_ledger_from_ledger(uuid, uuid, uuid, uuid, date, date)
  TO authenticated, service_role;

-- 4. apply_opening_balances: thin wrapper round post_to_ledger ----------------
CREATE OR REPLACE FUNCTION public.apply_opening_balances(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_opening_date date,
  p_entries jsonb,
  p_lock_period boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_source_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
BEGIN
  v_result := post_to_ledger(
    p_organization_id, p_client_id, p_company_id,
    p_opening_date, 'OPENING-BAL', 'Opening balances', 'OPENING_BALANCE',
    'OPENING_BALANCE', v_source_id, 'GBP', 1.0, v_actor, p_entries
  );

  IF COALESCE((v_result->>'success')::boolean, false) AND p_lock_period THEN
    INSERT INTO period_locks (organization_id, client_id, company_id, lock_date, locked_by, reason)
    VALUES (p_organization_id, p_client_id, p_company_id, p_opening_date, v_actor, 'Opening balance period lock')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_opening_balances(uuid, uuid, uuid, date, jsonb, boolean)
  TO authenticated, service_role;

-- 5. Account delete-protection ------------------------------------------------
CREATE OR REPLACE FUNCTION public.bookkeeping_accounts_protect_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.is_system_account, false) THEN
    RAISE EXCEPTION 'Cannot delete system account %', OLD.code USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE account_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'Account % is referenced by ledger_entries', OLD.code USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM journal_lines WHERE account_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'Account % is referenced by journal_lines', OLD.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_account_delete ON public.bookkeeping_accounts;
CREATE TRIGGER trg_protect_account_delete
  BEFORE DELETE ON public.bookkeeping_accounts
  FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_accounts_protect_delete();

-- 6. Audit triggers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_journals_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entity_type text;
  v_entity_id uuid;
  v_org uuid;
BEGIN
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  v_entity_type := CASE WHEN COALESCE(NEW.client_id, OLD.client_id) IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(NEW.client_id, OLD.client_id, NEW.company_id, OLD.company_id);

  INSERT INTO bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, before_state, after_state)
  VALUES (v_org, v_entity_type, v_entity_id,
          'journal_' || lower(TG_OP), auth.uid(),
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_journals ON public.journals;
CREATE TRIGGER trg_audit_journals
  AFTER INSERT OR UPDATE OR DELETE ON public.journals
  FOR EACH ROW EXECUTE FUNCTION public.audit_journals_change();

CREATE OR REPLACE FUNCTION public.audit_period_locks_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  v_entity_type := CASE WHEN COALESCE(NEW.client_id, OLD.client_id) IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(NEW.client_id, OLD.client_id, NEW.company_id, OLD.company_id);

  INSERT INTO bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, before_state, after_state, reason)
  VALUES (COALESCE(NEW.organization_id, OLD.organization_id),
          v_entity_type, v_entity_id,
          'period_lock_' || lower(TG_OP), auth.uid(),
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
          COALESCE(NEW.reason, OLD.reason));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_period_locks ON public.period_locks;
CREATE TRIGGER trg_audit_period_locks
  AFTER INSERT OR UPDATE OR DELETE ON public.period_locks
  FOR EACH ROW EXECUTE FUNCTION public.audit_period_locks_change();

CREATE OR REPLACE FUNCTION public.audit_bookkeeping_accounts_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  v_entity_type := CASE WHEN COALESCE(NEW.client_id, OLD.client_id) IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(NEW.client_id, OLD.client_id, NEW.company_id, OLD.company_id, COALESCE(NEW.organization_id, OLD.organization_id));

  INSERT INTO bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, before_state, after_state)
  VALUES (COALESCE(NEW.organization_id, OLD.organization_id),
          v_entity_type, v_entity_id,
          'account_' || lower(TG_OP), auth.uid(),
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bookkeeping_accounts ON public.bookkeeping_accounts;
CREATE TRIGGER trg_audit_bookkeeping_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.bookkeeping_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_bookkeeping_accounts_change();

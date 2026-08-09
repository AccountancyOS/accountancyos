-- =====================================================================================
-- DEF-033 — bank reconciliation has never worked. Four functions write three columns
-- that do not exist on public.bookkeeping_audit_log.
-- =====================================================================================
-- THE DEFECT. `start_bank_reconciliation`, `complete_bank_reconciliation`,
-- `reopen_bank_reconciliation` and `revalue_bank_account_fx` all close with an INSERT into
-- `public.bookkeeping_audit_log` naming `client_id`, `company_id` and `performed_by`
-- (`revalue_bank_account_fx` also names `payload`). That table has none of them. Every call
-- raises `42703` and the whole statement rolls back, so **no bank reconciliation has ever
-- been started, completed or reopened, and no FX revaluation has ever been posted.**
--
-- Confirmed against LIVE 2026-08-05/06, not inferred from git: `SELECT performed_by FROM
-- bookkeeping_audit_log` and `SELECT client_id FROM bookkeeping_audit_log` both return
-- `column ... does not exist`.
--
-- HOW IT WAS FOUND. Not by execution — statically, by `scripts/audit-phantom-columns.py`,
-- which replays every migration to reconstruct table→columns and checks each function's
-- INSERT column list against it. This is the same class as DEF-027 (`create_customer_safe`)
-- and DEF-028 (`stamp_portal_provenance`). All three were invisible to runtime probing
-- because an earlier error masked them, and all three were trivially visible statically.
-- Bank reconciliation does not appear anywhere in the launch-readiness defect register.
--
-- THE REPAIR IS NOT UNIFORM, for the same reason as DEF-027. Four names, three treatments:
--
--   `performed_by`  -> MAPPED to the existing `actor_id`. Identical concept; the table already
--     has the canonical column and `stamp_portal_provenance` already writes it. Adding
--     `performed_by` beside `actor_id` would give "who did this" two columns and no rule for
--     which wins.
--   `payload`       -> MAPPED to the existing `metadata`. Likewise: the other three functions
--     already call the same jsonb `metadata`, and only `revalue_bank_account_fx` calls it
--     `payload`. That is a naming slip, not a second concept.
--   `client_id`,
--   `company_id`    -> COLUMNS ADDED. Genuinely absent and genuinely distinct. The audit log is
--     scoped only by `organization_id`, so today "show me everything done on client X" cannot
--     be answered without joining out through `entity_id` — which does not resolve for a
--     reconciliation, whose entity is the reconciliation itself. A practice audit trail must be
--     answerable by client. Both are nullable: existing rows have no client dimension and are
--     not backfilled, because inventing one would be fabricating audit history.
--
-- AUTHORING METHOD. The four bodies were EXTRACTED from their defining migrations
-- (`20260609103337`, `20260609113058`) and edited programmatically against asserted anchors —
-- each substitution had to match exactly once or the generator aborted. Nothing was retyped.
-- The only change to any body is the audit-log INSERT column list. This follows the rule the
-- DEF-029 receipt set after that regression: never re-author a large body by hand.
--
-- KNOWN LIMITATION, stated rather than glossed. The bodies were extracted from GIT, not from
-- LIVE, because the database connector was unavailable at authoring time. Two functions have
-- already been found on production that exist in no migration (`email_queue_dispatch`,
-- `email_queue_wake`), so git and live are known to diverge. Before this is applied, the four
-- live bodies must be diffed against the four here; if any differs, this migration is
-- redeclared rather than applied. The post-assertions below catch a wrong END state but cannot
-- detect that a body was silently reverted to an older revision.
--
-- SCOPE. Two nullable columns added, four function bodies re-issued. No constraint, policy,
-- trigger, index or grant is altered. No data is modified or backfilled.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — reproduce the defect before repairing it (Gate 6).
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_col     text;
BEGIN
  -- The columns this migration maps ONTO must already exist, or the repair is built on sand.
  FOREACH v_col IN ARRAY ARRAY['organization_id','entity_type','entity_id','action','actor_id','metadata'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookkeeping_audit_log' AND column_name = v_col
    ) THEN
      v_missing := v_missing || v_col;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'DEF-033 precondition failed: bookkeeping_audit_log is missing expected column(s): %. The mapping in this migration would not land.',
      array_to_string(v_missing, ', ');
  END IF;

  -- Reproduce: the three phantom columns must genuinely be absent. If they already exist this
  -- has been applied or superseded, and re-issuing four bodies would be unjustified churn.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookkeeping_audit_log'
      AND column_name IN ('performed_by','payload')
  ) THEN
    RAISE EXCEPTION
      'DEF-033 precondition failed: bookkeeping_audit_log already has performed_by and/or payload. The schema is not as audited — this migration assumes those are the names to MAP AWAY from, not columns to write to.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookkeeping_audit_log' AND column_name = 'client_id'
  ) THEN
    RAISE EXCEPTION 'DEF-033 precondition failed: bookkeeping_audit_log.client_id already exists — refusing to re-apply.';
  END IF;

  -- All four functions must exist. If one has been renamed or dropped out of band, the repair
  -- set is wrong and a silent partial fix is worse than none.
  FOREACH v_col IN ARRAY ARRAY['start_bank_reconciliation','complete_bank_reconciliation','reopen_bank_reconciliation','revalue_bank_account_fx'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = v_col AND pronamespace = 'public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'DEF-033 precondition failed: function public.% does not exist.', v_col;
    END IF;
  END LOOP;

  RAISE NOTICE 'DEF-033 preconditions OK: the three phantom columns are absent and all four functions are present.';
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  Add the two columns that have no canonical home.
-- -------------------------------------------------------------------------------------
-- Nullable and NOT backfilled. Existing rows genuinely have no client dimension, and
-- inventing one would be fabricating audit history.

ALTER TABLE public.bookkeeping_audit_log
  ADD COLUMN IF NOT EXISTS client_id  uuid REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

COMMENT ON COLUMN public.bookkeeping_audit_log.client_id IS
  'Client the audited action concerned, where the entity does not resolve to one. Nullable; not backfilled. DEF-033.';
COMMENT ON COLUMN public.bookkeeping_audit_log.company_id IS
  'Company the audited action concerned, where the entity does not resolve to one. Nullable; not backfilled. DEF-033.';

-- An audit trail that cannot be filtered by client is why these columns exist; without an
-- index that filter table-scans a log that only grows.
CREATE INDEX IF NOT EXISTS bookkeeping_audit_log_client_idx
  ON public.bookkeeping_audit_log (client_id, created_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookkeeping_audit_log_company_idx
  ON public.bookkeeping_audit_log (company_id, created_at DESC) WHERE company_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- §3  Re-issue the four bodies. Extracted and anchor-edited; only the INSERT list changed.
-- -------------------------------------------------------------------------------------
-- ---- start_bank_reconciliation ---------------------------------------------
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
    organization_id, client_id, company_id, entity_type, entity_id, action, actor_id, metadata
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

-- ---- complete_bank_reconciliation ------------------------------------------
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
    organization_id, client_id, company_id, entity_type, entity_id, action, actor_id, metadata
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

-- ---- reopen_bank_reconciliation --------------------------------------------
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
    organization_id, client_id, company_id, entity_type, entity_id, action, actor_id, metadata
  ) VALUES (
    v_rec.organization_id, v_rec.client_id, v_rec.company_id,
    'reconciliation', p_reconciliation_id, 'reopen_bank_reconciliation', auth.uid(),
    jsonb_build_object('reason', p_reason)
  );

  RETURN p_reconciliation_id;
END;
$$;

-- ---- revalue_bank_account_fx -----------------------------------------------
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
    organization_id, client_id, company_id, action, entity_type, entity_id, metadata, actor_id
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


-- -------------------------------------------------------------------------------------
-- §4  POST-ASSERTIONS — self-verifying. A partial apply aborts the whole transaction.
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_fn  text;
  v_src text;
BEGIN
  -- The two columns landed, nullable, on the right table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookkeeping_audit_log'
      AND column_name='client_id' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'DEF-033 post-assert failed: bookkeeping_audit_log.client_id is absent or NOT NULL.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookkeeping_audit_log'
      AND column_name='company_id' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'DEF-033 post-assert failed: bookkeeping_audit_log.company_id is absent or NOT NULL.';
  END IF;

  -- No phantom column was created as a shortcut. If these exist, someone "fixed" this by
  -- adding performed_by/payload instead of mapping onto the canonical columns, which is the
  -- two-sources-of-truth outcome this migration exists to avoid.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookkeeping_audit_log'
      AND column_name IN ('performed_by','payload')
  ) THEN
    RAISE EXCEPTION 'DEF-033 post-assert failed: performed_by/payload exists on bookkeeping_audit_log — the mapping was bypassed.';
  END IF;

  -- Every repaired body must now name actor_id and must NOT name the phantom columns.
  FOREACH v_fn IN ARRAY ARRAY['start_bank_reconciliation','complete_bank_reconciliation','reopen_bank_reconciliation','revalue_bank_account_fx'] LOOP
    SELECT prosrc INTO v_src
    FROM pg_proc WHERE proname = v_fn AND pronamespace = 'public'::regnamespace LIMIT 1;

    IF v_src IS NULL THEN
      RAISE EXCEPTION 'DEF-033 post-assert failed: public.% is absent after the re-issue.', v_fn;
    END IF;
    IF v_src LIKE '%performed_by%' THEN
      RAISE EXCEPTION 'DEF-033 post-assert failed: public.% still writes performed_by.', v_fn;
    END IF;
    IF v_src NOT LIKE '%bookkeeping_audit_log%' THEN
      RAISE EXCEPTION 'DEF-033 post-assert failed: public.% lost its audit-log write entirely.', v_fn;
    END IF;
    IF v_src NOT LIKE '%actor_id%' THEN
      RAISE EXCEPTION 'DEF-033 post-assert failed: public.% does not write actor_id.', v_fn;
    END IF;
  END LOOP;

  -- revalue_bank_account_fx specifically must no longer name payload.
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'revalue_bank_account_fx' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_src LIKE '%payload%' THEN
    RAISE EXCEPTION 'DEF-033 post-assert failed: revalue_bank_account_fx still writes payload.';
  END IF;

  -- Exactly one signature each — no overload was introduced (the DEF-002 failure mode).
  FOREACH v_fn IN ARRAY ARRAY['start_bank_reconciliation','complete_bank_reconciliation','reopen_bank_reconciliation','revalue_bank_account_fx'] LOOP
    IF (SELECT count(*) FROM pg_proc WHERE proname = v_fn AND pronamespace = 'public'::regnamespace) <> 1 THEN
      RAISE EXCEPTION 'DEF-033 post-assert failed: public.% has % signatures, expected exactly 1.',
        v_fn, (SELECT count(*) FROM pg_proc WHERE proname = v_fn AND pronamespace='public'::regnamespace);
    END IF;
  END LOOP;

  RAISE NOTICE 'DEF-033 post-assertions passed: 2 columns added, 4 bodies repaired, no phantom column introduced.';
END $mig$;

COMMIT;

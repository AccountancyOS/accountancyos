-- =============================================================================================
-- 006_security_containment.sql — LONDON ONLY (ezsvdsjdtardkxfswjvq). Never apply anywhere else.
-- Apply as migration `london_inc_006_security_containment` — ONLY after owner approval.
-- =============================================================================================
--
-- Cutover workstream A: closes the anonymous / unchecked SECURITY DEFINER entry points and the
-- provider-token exposure found in the 2026-11-11 readiness assessment. Caller map, per-function
-- decisions and evidence: docs/migration/london-increments/006_CALLER_MAP.md.
--
-- A1  Function EXECUTE grants and caller identity
--     (a) service-role only ......... 9 overloads (pgmq wrappers, public_complete_billing,
--                                     get_trial_balance_from_ledger, 8-arg payment overloads,
--                                     trigger_records_request(uuid,uuid))
--     (b) signed-in, body rewritten . 5 (post_to_ledger, approve_invoice, approve_bill,
--                                     lifecycle_send_back_onboarding, trigger_records_request(uuid))
--     (b) signed-in, grants only .... 2 (9-arg record_invoice_payment / record_bill_payment:
--                                     their bodies already take the actor from auth.uid() and
--                                     refuse non-members before any write — SEC-1, 20260705120000)
--     REVOKE ... FROM PUBLIC is explicit everywhere: Postgres grants EXECUTE to PUBLIC by default,
--     so revoking only from anon would leave the hole open.
--     No signature changes: every caller keeps working against the same identity arguments.
--     p_created_by / p_user_id remain in the signatures but are IGNORED unless the caller is the
--     service role.
--
-- A2  bank_connections / connected_mailboxes
--     Table-level privileges revoked from anon and authenticated; authenticated re-granted
--     column-level SELECT on non-secret columns only (and DELETE on connected_mailboxes, which the
--     Settings "disconnect" action uses). Token columns are readable only by the service role.
--     Portal SELECT policy on bank_connections dropped: no portal screen reads it.
--     The `_safe` views are security_invoker, so they inherit these column grants; anon loses
--     its grants on them too.
--     provider_connection_id held the first 32 chars of the TrueLayer access token
--     (truelayer-callback); any such value is replaced with an opaque UUID.
--
-- Idempotent: every object carries a `london_inc_006` marker comment once changed. Preconditions accept
-- either the exact pre-006 state captured from London on 2026-11-11 or an already-applied 006
-- state, and refuse anything else. Post-assertions RAISE if any target is still callable by
-- anon/PUBLIC or any secret column is still selectable by anon/authenticated.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Preconditions — refuse rather than half-apply
-- ---------------------------------------------------------------------------------------------
DO $pre$
DECLARE
  r record;
  v_oid oid;
  v_done boolean;
BEGIN
  -- Every target overload exists with exactly this identity, and is either untouched since the
  -- 2026-11-11 capture (prosrc md5 + ACL) or already carries the 006 marker.
  FOR r IN SELECT * FROM (VALUES
    ('public.read_email_batch(text,integer,integer)', 'a50fdee3ce25df11533f1911c03f2e2b', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.enqueue_email(text,jsonb)', '4483879669e0c80ecb876151dee937d2', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.delete_email(text,bigint)', '2cd34cff7c6bdf2db1f6935ec51dc8db', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.move_to_dlq(text,text,bigint,jsonb)', '121ff5ca3d6e8e9fe91e278ab48a947a', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.public_complete_billing(uuid,text,numeric,text)', '0301b7748bd11d296dc011418423c752', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date)', 'bad2931481c58354a6d9f52671b789e5', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)', '736822136f57682ad3dc74ac24b62fe7', '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)', '881266fce96a5c7df34fca48cc5fe3ce', '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.trigger_records_request(uuid,uuid)', '495a044db7b57812e1f24e2129477277', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)', 'ceb779df32195f79cd5bd6876e58e58c', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.approve_invoice(uuid,uuid)', '55912a69be23b6f183ab551da728515a', '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.approve_bill(uuid,uuid)', '6c4764ad608484b952272b35366d730c', '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.lifecycle_send_back_onboarding(uuid,text,text)', '27c35eb5f8b801e5ae2bd89be80aea76', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.trigger_records_request(uuid)', '9d67a38b6852c71c45cc4b70dcdfabb5', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)', '1c02253dc08362bb160c27d5c396d170', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)', 'a1a8d0fd9f6ec85d536ef5059f5806e9', '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
  ) AS t(sig, src_md5, acl) LOOP
    v_oid := to_regprocedure(r.sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '006 precondition: % does not exist with this exact signature', r.sig;
    END IF;
    v_done := coalesce(obj_description(v_oid, 'pg_proc'), '') LIKE 'london_inc_006%';
    IF NOT v_done THEN
      IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> r.src_md5 THEN
        RAISE EXCEPTION '006 precondition: body of % differs from the 2026-11-11 London capture', r.sig;
      END IF;
      IF (SELECT coalesce(proacl::text, '') FROM pg_proc WHERE oid = v_oid) <> r.acl THEN
        RAISE EXCEPTION '006 precondition: ACL of % is % (expected %)', r.sig,
          (SELECT proacl::text FROM pg_proc WHERE oid = v_oid), r.acl;
      END IF;
    END IF;
  END LOOP;

  -- No further overloads of the target names exist (an unexpected overload would stay open).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN (
         'post_to_ledger','approve_invoice','approve_bill','record_invoice_payment','record_bill_payment',
         'read_email_batch','enqueue_email','delete_email','move_to_dlq','lifecycle_send_back_onboarding',
         'public_complete_billing','trigger_records_request','get_trial_balance_from_ledger')) <> 16 THEN
    RAISE EXCEPTION '006 precondition: unexpected number of overloads of the target functions';
  END IF;

  -- Helpers the rewritten bodies call.
  IF to_regprocedure('public.can_issue_invoices(uuid,uuid)') IS NULL
     OR to_regprocedure('public.can_approve_bills(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_in_organization(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '006 precondition: a capability helper the new bodies depend on is missing';
  END IF;

  -- Token tables: exact column sets (a new, unclassified column must not slip through the
  -- column grants), and either the pre-006 table ACL or the 006 marker.
  IF (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'bank_connections')
     <> (SELECT array_agg(c ORDER BY c) FROM unnest(ARRAY['id', 'organization_id', 'client_id', 'company_id', 'provider', 'provider_connection_id', 'status', 'access_token', 'refresh_token', 'consent_expires_at', 'bank_name', 'bank_logo_url', 'created_at', 'updated_at', 'scope', 'last_error', 'last_synced_at']) c) THEN
    RAISE EXCEPTION '006 precondition: bank_connections columns differ from the classified set';
  END IF;
  IF (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'connected_mailboxes')
     <> (SELECT array_agg(c ORDER BY c) FROM unnest(ARRAY['id', 'organization_id', 'user_id', 'provider', 'email_address', 'access_token', 'refresh_token', 'token_expires_at', 'scopes', 'sync_enabled', 'last_sync_at', 'sync_cursor', 'status', 'error_message', 'created_at', 'updated_at', 'mailbox_type']) c) THEN
    RAISE EXCEPTION '006 precondition: connected_mailboxes columns differ from the classified set';
  END IF;
  FOR r IN SELECT unnest(ARRAY['public.bank_connections','public.connected_mailboxes']) AS tbl LOOP
    IF coalesce(obj_description(r.tbl::regclass, 'pg_class'), '') NOT LIKE 'london_inc_006%'
       AND (SELECT relacl::text FROM pg_class WHERE oid = r.tbl::regclass) <> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' THEN
      RAISE EXCEPTION '006 precondition: % ACL differs from the 2026-11-11 London capture', r.tbl;
    END IF;
  END LOOP;

  -- The _safe views must be security_invoker, or column grants would not reach them.
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname IN ('bank_connections_safe','connected_mailboxes_safe')
                AND NOT coalesce('security_invoker=on' = ANY (c.reloptions), false))
     OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname IN ('bank_connections_safe','connected_mailboxes_safe')) <> 2 THEN
    RAISE EXCEPTION '006 precondition: a _safe view is missing or not security_invoker';
  END IF;
END
$pre$;

-- ---------------------------------------------------------------------------------------------
-- A1(b) — signed-in callers: rewritten bodies (actor from auth.uid(); membership/role enforced
--          before any write). Generated from the live London definitions by exact patching; see
--          006_CALLER_MAP.md for the per-function diff.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_to_ledger(p_organization_id uuid, p_client_id uuid, p_company_id uuid, p_journal_date date, p_reference text, p_description text, p_journal_type text, p_source_type text, p_source_id uuid, p_currency text DEFAULT 'GBP'::text, p_fx_rate numeric DEFAULT 1.0, p_created_by uuid DEFAULT NULL::uuid, p_entries jsonb DEFAULT '[]'::jsonb, p_lock_override_reason text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journal_id uuid;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_entry jsonb;
  v_line_number int := 0;
  v_ledger_ids uuid[] := '{}';
  v_ledger_id uuid;
  v_lock_date date;
  v_actor uuid;
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
  -- ---- Caller identity (london_inc_006) -------------------------------------
  -- The actor is the authenticated caller, never a parameter. p_created_by is honoured ONLY for
  -- the service role (trusted server code that has authenticated its own caller). Refusals RAISE
  -- 42501 from this OUTER block, so they cannot be swallowed by the posting block's
  -- EXCEPTION handler and reported as an ordinary posting failure, and no audit row is written
  -- into another organisation's log.
  IF auth.role() = 'service_role' THEN
    v_actor := p_created_by;
  ELSE
    v_actor := auth.uid();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'post_to_ledger: not authenticated' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_actor IS NOT NULL AND p_organization_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM organization_users
       WHERE organization_id = p_organization_id AND user_id = v_actor
     ) THEN
    RAISE EXCEPTION 'post_to_ledger: caller is not a member of the target organization'
      USING ERRCODE = '42501';
  END IF;

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
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_debtors_id uuid;
  v_vat_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_uid uuid;
BEGIN
  -- ---- Caller identity (london_inc_006) -------------------------------------
  -- Actor = auth.uid(); p_user_id is honoured ONLY for the service role.
  IF auth.role() = 'service_role' THEN
    v_uid := p_user_id;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'approve_invoice: not authenticated' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
  END IF;

  -- Role check against the row's own organisation (london_inc_006).
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.can_issue_invoices(v_uid, v_invoice.organization_id) THEN
    RAISE EXCEPTION 'approve_invoice: caller lacks can_issue_invoices for this organization' USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status <> 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_status', 'error_message', 'Invoice is not in draft status');
  END IF;
  IF v_invoice.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_posted', 'error_message', 'Invoice already posted');
  END IF;

  v_entity_type := CASE WHEN v_invoice.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_invoice.client_id, v_invoice.company_id);

  -- Resolve control accounts (structured taxonomy, not name matching)
  SELECT id INTO v_debtors_id FROM bookkeeping_accounts
   WHERE organization_id = v_invoice.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_DEBTORS','DEBTOR','RECEIVABLE','ACCOUNTS_RECEIVABLE')
   LIMIT 1;
  IF v_debtors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Debtors control account not found');
  END IF;

  SELECT id INTO v_vat_id FROM bookkeeping_accounts
   WHERE organization_id = v_invoice.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('VAT_CONTROL','VAT')
   LIMIT 1;

  -- DR Trade Debtors (gross)
  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'account_id', v_debtors_id,
    'debit', v_invoice.total_gross,
    'credit', NULL,
    'description', 'Sales Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8)) || ': ' || COALESCE(v_invoice.contact_name,'')
  ));

  -- CR Sales accounts per line (net)
  FOR v_line IN SELECT * FROM invoice_lines WHERE invoice_id = p_invoice_id ORDER BY line_number LOOP
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_line.account_id,
      'debit', NULL,
      'credit', v_line.net_amount,
      'description', COALESCE(v_invoice.invoice_number,'') || ': ' || v_line.description,
      'vat_code_id', v_line.vat_code_id
    ));
  END LOOP;

  -- CR VAT Control (total VAT)
  IF v_invoice.total_vat > 0 AND v_vat_id IS NOT NULL THEN
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_vat_id,
      'debit', NULL,
      'credit', v_invoice.total_vat,
      'description', 'VAT on Invoice ' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8))
    ));
  END IF;

  v_post_result := post_to_ledger(
    p_organization_id := v_invoice.organization_id,
    p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
    p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
    p_journal_date    := v_invoice.issue_date,
    p_reference       := v_invoice.invoice_number,
    p_description     := 'INVOICE posting',
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'INVOICE',
    p_source_id       := p_invoice_id,
    p_currency        := COALESCE(v_invoice.currency,'GBP'),
    p_fx_rate         := COALESCE(v_invoice.exchange_rate,1.0),
    p_created_by      := v_uid,
    p_entries         := v_entries
  );

  IF NOT (v_post_result->>'success')::boolean THEN
    RAISE EXCEPTION 'Posting failed: %', v_post_result->>'error_message'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE invoices
     SET status = 'AWAITING_PAYMENT',
         is_posted = true,
         posted_at = now(),
         posted_by = v_uid,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_post_result->>'journal_id');
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_bill(p_bill_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill RECORD;
  v_entity_type text;
  v_entity_id uuid;
  v_creditors_id uuid;
  v_vat_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_uid uuid;
BEGIN
  -- ---- Caller identity (london_inc_006) -------------------------------------
  -- Actor = auth.uid(); p_user_id is honoured ONLY for the service role.
  IF auth.role() = 'service_role' THEN
    v_uid := p_user_id;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'approve_bill: not authenticated' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
  END IF;

  -- Role check against the row's own organisation (london_inc_006).
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.can_approve_bills(v_uid, v_bill.organization_id) THEN
    RAISE EXCEPTION 'approve_bill: caller lacks can_approve_bills for this organization' USING ERRCODE = '42501';
  END IF;
  IF v_bill.status <> 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_status', 'error_message', 'Bill is not in draft status');
  END IF;
  IF v_bill.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_posted', 'error_message', 'Bill already posted');
  END IF;

  v_entity_type := CASE WHEN v_bill.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_bill.client_id, v_bill.company_id);

  SELECT id INTO v_creditors_id FROM bookkeeping_accounts
   WHERE organization_id = v_bill.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('TRADE_CREDITORS','CREDITOR','PAYABLE','ACCOUNTS_PAYABLE')
   LIMIT 1;
  IF v_creditors_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_control_account', 'error_message', 'Trade Creditors control account not found');
  END IF;

  SELECT id INTO v_vat_id FROM bookkeeping_accounts
   WHERE organization_id = v_bill.organization_id
     AND ((v_entity_type='client'  AND client_id  = v_entity_id)
       OR (v_entity_type='company' AND company_id = v_entity_id))
     AND is_active = true AND is_control_account = true
     AND account_subtype IN ('VAT_CONTROL','VAT')
   LIMIT 1;

  -- DR expense accounts per line (net)
  FOR v_line IN SELECT * FROM bill_lines WHERE bill_id = p_bill_id ORDER BY line_number LOOP
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_line.account_id,
      'debit', v_line.net_amount,
      'credit', NULL,
      'description', 'Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8)) || ': ' || v_line.description,
      'vat_code_id', v_line.vat_code_id
    ));
  END LOOP;

  IF v_bill.total_vat > 0 AND v_vat_id IS NOT NULL THEN
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_vat_id,
      'debit', v_bill.total_vat,
      'credit', NULL,
      'description', 'VAT on Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
    ));
  END IF;

  -- CR Trade Creditors (gross)
  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'account_id', v_creditors_id,
    'debit', NULL,
    'credit', v_bill.total_gross,
    'description', 'Bill ' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8))
  ));

  v_post_result := post_to_ledger(
    p_organization_id := v_bill.organization_id,
    p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
    p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
    p_journal_date    := v_bill.issue_date,
    p_reference       := v_bill.bill_number,
    p_description     := 'BILL posting',
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'BILL',
    p_source_id       := p_bill_id,
    p_currency        := COALESCE(v_bill.currency,'GBP'),
    p_fx_rate         := COALESCE(v_bill.exchange_rate,1.0),
    p_created_by      := v_uid,
    p_entries         := v_entries
  );

  IF NOT (v_post_result->>'success')::boolean THEN
    RAISE EXCEPTION 'Posting failed: %', v_post_result->>'error_message'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bills
     SET status = 'AWAITING_PAYMENT',
         is_posted = true,
         posted_at = now(),
         posted_by = v_uid,
         updated_at = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_post_result->>'journal_id');
END;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_send_back_onboarding(p_application_id uuid, p_step text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app RECORD;
BEGIN
  -- ---- Caller identity (london_inc_006) -------------------------------------
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'lifecycle_send_back_onboarding: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding application % not found', p_application_id;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.user_in_organization(auth.uid(), v_app.organization_id) THEN
    RAISE EXCEPTION 'lifecycle_send_back_onboarding: caller is not a member of this organization'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'needs_client_action',
         updated_at = now()
   WHERE id = p_application_id;

  IF v_app.email IS NOT NULL AND v_app.email <> '' THEN
    INSERT INTO public.email_queue (
      organization_id, to_email, to_name, subject, body_html,
      entity_type, entity_id, context, status
    ) VALUES (
      v_app.organization_id,
      v_app.email,
      COALESCE(v_app.company_name, TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,''))),
      'Action required to complete your onboarding',
      '<p>Hello,</p><p>Your accountant has reviewed your onboarding and needs you to revisit the <strong>' || p_step || '</strong> step.</p>' ||
      CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '<p><em>' || p_reason || '</em></p>' ELSE '' END ||
      '<p>Please continue here: <a href="' || COALESCE(current_setting('app.public_url', true), '') || '/onboard/' || p_application_id || '">Resume onboarding</a></p>',
      'onboarding_application',
      p_application_id,
      'onboarding',
      'pending'
    );
  END IF;

  RETURN jsonb_build_object('status', 'needs_client_action');
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_records_request(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
  v_service services_catalog%ROWTYPE;
  v_template templates%ROWTYPE;
  v_questionnaire_instance_id uuid;
  v_client_email text;
  v_client_name text;
  v_access_token text;
BEGIN
  -- ---- Caller identity (london_inc_006) -------------------------------------
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'trigger_records_request: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Get job
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.user_in_organization(auth.uid(), v_job.organization_id) THEN
    RAISE EXCEPTION 'trigger_records_request: caller is not a member of this organization'
      USING ERRCODE = '42501';
  END IF;
  
  -- Get service
  IF v_job.service_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job has no service assigned');
  END IF;
  
  SELECT * INTO v_service FROM services_catalog WHERE id = v_job.service_id;
  IF v_service.records_request_template_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service has no records request template');
  END IF;
  
  -- Get template
  SELECT * INTO v_template FROM templates WHERE id = v_service.records_request_template_id;
  
  -- Get client email
  IF v_job.client_id IS NOT NULL THEN
    SELECT email, first_name || ' ' || last_name INTO v_client_email, v_client_name
    FROM clients WHERE id = v_job.client_id;
  ELSIF v_job.company_id IS NOT NULL THEN
    SELECT email, company_name INTO v_client_email, v_client_name
    FROM companies WHERE id = v_job.company_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Job has no client or company');
  END IF;
  
  -- Generate access token
  v_access_token := encode(gen_random_bytes(32), 'hex');
  
  -- Create questionnaire instance
  INSERT INTO questionnaire_instances (
    organization_id,
    template_id,
    client_id,
    company_id,
    job_id,
    status,
    access_token,
    token_expires_at
  ) VALUES (
    v_job.organization_id,
    v_service.records_request_template_id,
    v_job.client_id,
    v_job.company_id,
    p_job_id,
    'sent',
    v_access_token,
    now() + interval '30 days'
  ) RETURNING id INTO v_questionnaire_instance_id;
  
  -- Link to job
  INSERT INTO job_questionnaire_instances (
    job_id,
    questionnaire_instance_id,
    questionnaire_type,
    trigger_status,
    feeds_workpaper
  ) VALUES (
    p_job_id,
    v_questionnaire_instance_id,
    'records_request',
    'awaiting_info',
    true
  );
  
  -- Update job
  UPDATE jobs SET info_requested_at = now() WHERE id = p_job_id;
  
  -- Queue email (will be sent via connected mailbox)
  INSERT INTO email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    status,
    entity_type,
    entity_id,
    job_id,
    client_id,
    company_id,
    context,
    merge_data
  ) VALUES (
    v_job.organization_id,
    v_client_email,
    v_client_name,
    'Information Request: ' || v_job.name,
    '<p>Dear ' || v_client_name || ',</p>' ||
    '<p>We need some information from you to complete your ' || v_job.name || '.</p>' ||
    '<p>Please click the link below to provide the required information:</p>' ||
    '<p><a href="{{questionnaire_url}}">Complete Information Request</a></p>' ||
    '<p>This link will expire in 30 days.</p>',
    'pending',
    'questionnaire',
    v_questionnaire_instance_id,
    p_job_id,
    v_job.client_id,
    v_job.company_id,
    'job',
    jsonb_build_object(
      'questionnaire_url', '{{BASE_URL}}/questionnaire/' || v_access_token,
      'job_name', v_job.name,
      'client_name', v_client_name
    )
  );
  
  -- Log audit
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, metadata)
  VALUES (
    v_job.organization_id,
    'job',
    p_job_id,
    'records_request_sent',
    jsonb_build_object('questionnaire_instance_id', v_questionnaire_instance_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'questionnaire_instance_id', v_questionnaire_instance_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- A1 grants. REVOKE FROM PUBLIC is explicit in every case.
-- ---------------------------------------------------------------------------------------------
-- (a) service-role only
-- read_email_batch(text,integer,integer): pgmq wrapper; only process-email-queue (service role) calls it
REVOKE ALL ON FUNCTION public.read_email_batch(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text,integer,integer) TO service_role;
-- enqueue_email(text,jsonb): pgmq wrapper; only auth-email-hook (service role) calls it
REVOKE ALL ON FUNCTION public.enqueue_email(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text,jsonb) TO service_role;
-- delete_email(text,bigint): pgmq wrapper; only process-email-queue (service role) calls it
REVOKE ALL ON FUNCTION public.delete_email(text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text,bigint) TO service_role;
-- move_to_dlq(text,text,bigint,jsonb): pgmq wrapper; only process-email-queue (service role) calls it
REVOKE ALL ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) TO service_role;
-- public_complete_billing(uuid,text,numeric,text): only onboarding-stripe-verify (service role) calls it, after verifying the Stripe session
REVOKE ALL ON FUNCTION public.public_complete_billing(uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_complete_billing(uuid,text,numeric,text) TO service_role;
-- get_trial_balance_from_ledger(uuid,uuid,uuid,date,date): no caller in src/, edge functions, SQL, triggers or cron
REVOKE ALL ON FUNCTION public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date) TO service_role;
-- record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid): 8-arg overload with no org check; only caller is record_invoice_payment_safe (SECURITY DEFINER, runs as owner)
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) TO service_role;
-- record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid): 8-arg overload with no org check; no caller
REVOKE ALL ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) TO service_role;
-- trigger_records_request(uuid,uuid): no caller (the frontend uses the 1-arg overload)
REVOKE ALL ON FUNCTION public.trigger_records_request(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_records_request(uuid,uuid) TO service_role;

-- pgmq wrappers were SECURITY DEFINER with no search_path; every reference in their bodies is
-- schema-qualified (pgmq.*), so an empty search_path is safe and closes object shadowing.
ALTER FUNCTION public.read_email_batch(text,integer,integer) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text,jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text,bigint) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text,text,bigint,jsonb) SET search_path = '';

-- (b) signed-in users: anon and PUBLIC removed, authenticated and service_role kept
REVOKE ALL ON FUNCTION public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_invoice(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_bill(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_bill(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.lifecycle_send_back_onboarding(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_send_back_onboarding(uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trigger_records_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_records_request(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) TO authenticated, service_role;

-- Markers (idempotency + provenance)
COMMENT ON FUNCTION public.read_email_batch(text,integer,integer) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.enqueue_email(text,jsonb) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.delete_email(text,bigint) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.move_to_dlq(text,text,bigint,jsonb) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.public_complete_billing(uuid,text,numeric,text) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.trigger_records_request(uuid,uuid) IS 'london_inc_006: service-role only';
COMMENT ON FUNCTION public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.approve_invoice(uuid,uuid) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.approve_bill(uuid,uuid) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.lifecycle_send_back_onboarding(uuid,text,text) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.trigger_records_request(uuid) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) IS 'london_inc_006: signed-in; actor from auth.uid()';
COMMENT ON FUNCTION public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) IS 'london_inc_006: signed-in; actor from auth.uid()';

-- ---------------------------------------------------------------------------------------------
-- A2 — provider tokens readable only by the service role
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.bank_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, client_id, company_id, provider, provider_connection_id, status, consent_expires_at, bank_name, bank_logo_url, created_at, updated_at, scope, last_error, last_synced_at)
  ON public.bank_connections TO authenticated;
GRANT ALL ON TABLE public.bank_connections TO service_role;

REVOKE ALL ON TABLE public.connected_mailboxes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, user_id, provider, email_address, token_expires_at, sync_enabled, last_sync_at, status, error_message, created_at, updated_at, mailbox_type)
  ON public.connected_mailboxes TO authenticated;
-- Settings -> "Disconnect" deletes the caller's own mailbox (RLS: user_id = auth.uid()).
GRANT DELETE ON public.connected_mailboxes TO authenticated;
GRANT ALL ON TABLE public.connected_mailboxes TO service_role;

-- The _safe views are security_invoker: reads through them are checked against the column grants
-- above. anon has no business reading either; authenticated needs SELECT only.
REVOKE ALL ON TABLE public.bank_connections_safe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bank_connections_safe TO authenticated;
REVOKE ALL ON TABLE public.connected_mailboxes_safe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.connected_mailboxes_safe TO authenticated;

-- No portal screen reads bank_connections (grep of src/: zero references to bank_connections or
-- bank_connections_safe). The policy only widened who could see the row.
DROP POLICY IF EXISTS "Portal clients can view their bank connections" ON public.bank_connections;

-- provider_connection_id was written as the first 32 characters of the TrueLayer access token.
-- It is a user-readable column, so any such value is replaced with an opaque identifier.
UPDATE public.bank_connections
   SET provider_connection_id = gen_random_uuid()::text
 WHERE access_token IS NOT NULL
   AND provider_connection_id = left(access_token, 32);

COMMENT ON TABLE public.bank_connections IS 'london_inc_006: token columns service-role only';
COMMENT ON TABLE public.connected_mailboxes IS 'london_inc_006: token columns service-role only';

-- ---------------------------------------------------------------------------------------------
-- Post-assertions — refuse to commit unless the effect landed
-- ---------------------------------------------------------------------------------------------
DO $post$
DECLARE
  r record;
  v_oid oid;
  v_src text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.read_email_batch(text,integer,integer)', 'service'),
    ('public.enqueue_email(text,jsonb)', 'service'),
    ('public.delete_email(text,bigint)', 'service'),
    ('public.move_to_dlq(text,text,bigint,jsonb)', 'service'),
    ('public.public_complete_billing(uuid,text,numeric,text)', 'service'),
    ('public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date)', 'service'),
    ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)', 'service'),
    ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)', 'service'),
    ('public.trigger_records_request(uuid,uuid)', 'service'),
    ('public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)', 'signed_in'),
    ('public.approve_invoice(uuid,uuid)', 'signed_in'),
    ('public.approve_bill(uuid,uuid)', 'signed_in'),
    ('public.lifecycle_send_back_onboarding(uuid,text,text)', 'signed_in'),
    ('public.trigger_records_request(uuid)', 'signed_in'),
    ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)', 'signed_in'),
    ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)', 'signed_in')
  ) AS t(sig, kind) LOOP
    v_oid := to_regprocedure(r.sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '006 post: % is missing', r.sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '006 post: anon can still execute %', r.sig;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_oid AND a.grantee = 0) THEN
      RAISE EXCEPTION '006 post: PUBLIC still holds EXECUTE on %', r.sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '006 post: service_role lost EXECUTE on %', r.sig;
    END IF;
    IF r.kind = 'service' AND has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '006 post: authenticated can still execute service-only %', r.sig;
    END IF;
    IF r.kind = 'signed_in' AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '006 post: authenticated lost EXECUTE on signed-in %', r.sig;
    END IF;
  END LOOP;

  -- No rewritten or grants-only signed-in body may take identity from a parameter.
  FOR r IN SELECT unnest(ARRAY[
    'public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)',
    'public.approve_invoice(uuid,uuid)',
    'public.approve_bill(uuid,uuid)',
    'public.lifecycle_send_back_onboarding(uuid,text,text)',
    'public.trigger_records_request(uuid)'
  ]) AS sig LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_src ~ 'COALESCE\(p_(created_by|user_id), auth\.uid\(\)\)' THEN
      RAISE EXCEPTION '006 post: % still derives its actor from a caller-supplied parameter', r.sig;
    END IF;
    IF position('london_inc_006' IN v_src) = 0 OR position('42501' IN v_src) = 0 THEN
      RAISE EXCEPTION '006 post: % does not carry the 006 identity guard', r.sig;
    END IF;
  END LOOP;

  -- pgmq wrappers pinned to an empty search_path.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('read_email_batch','enqueue_email','delete_email','move_to_dlq')
                AND NOT coalesce('search_path=""' = ANY (p.proconfig), false)) THEN
    RAISE EXCEPTION '006 post: a pgmq wrapper has no pinned search_path';
  END IF;

  -- Secret columns: unreadable by anon and authenticated, still readable by the service role.
  FOR r IN SELECT * FROM (VALUES
    ('public.bank_connections', 'access_token'),
    ('public.bank_connections', 'refresh_token'),
    ('public.connected_mailboxes', 'access_token'),
    ('public.connected_mailboxes', 'refresh_token'),
    ('public.connected_mailboxes', 'sync_cursor'),
    ('public.connected_mailboxes', 'scopes')
  ) AS t(tbl, col) LOOP
    IF has_column_privilege('anon', r.tbl, r.col, 'SELECT')
       OR has_column_privilege('authenticated', r.tbl, r.col, 'SELECT') THEN
      RAISE EXCEPTION '006 post: %.% is still selectable by anon or authenticated', r.tbl, r.col;
    END IF;
    IF NOT has_column_privilege('service_role', r.tbl, r.col, 'SELECT') THEN
      RAISE EXCEPTION '006 post: service_role lost SELECT on %.%', r.tbl, r.col;
    END IF;
  END LOOP;

  -- anon holds nothing on either table or view; authenticated cannot write bank_connections at all
  -- and can only DELETE (not INSERT/UPDATE) connected_mailboxes.
  IF has_table_privilege('anon', 'public.bank_connections', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.connected_mailboxes', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.bank_connections_safe', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.connected_mailboxes_safe', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION '006 post: anon still holds a privilege on a token table or view';
  END IF;
  IF has_table_privilege('authenticated', 'public.bank_connections', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.connected_mailboxes', 'INSERT,UPDATE') THEN
    RAISE EXCEPTION '006 post: authenticated can still write a token table';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.connected_mailboxes', 'email_address', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.bank_connections', 'bank_name', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.connected_mailboxes', 'DELETE') THEN
    RAISE EXCEPTION '006 post: authenticated lost a non-secret privilege the app relies on';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_connections'
              AND policyname = 'Portal clients can view their bank connections') THEN
    RAISE EXCEPTION '006 post: portal SELECT policy on bank_connections still present';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bank_connections
              WHERE access_token IS NOT NULL AND provider_connection_id = left(access_token, 32)) THEN
    RAISE EXCEPTION '006 post: a token-derived provider_connection_id remains';
  END IF;
END
$post$;

COMMIT;

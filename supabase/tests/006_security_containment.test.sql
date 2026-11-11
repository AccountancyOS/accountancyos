-- pgTAP tests for London increment 006 (cutover workstream A — security containment).
--
-- Run against a database that has london-baseline.sql + london-increments 001..006 applied,
-- e.g. `supabase test db` once CI has a database (workstream B). Everything runs inside one
-- transaction and is rolled back.
--
-- Two halves:
--   1. The grant matrix — who may EXECUTE each A1 function, and who may SELECT each token column.
--   2. Behaviour — for every signed-in (b) function: no JWT fails; a JWT for a member of org X
--      acting on org Y fails with 42501; a JWT for a correctly-roled member of org Y succeeds.

BEGIN;
SELECT plan(71);

-- ------------------------------------------------------------------------------------------
-- Helper: run SQL as a PostgREST-style caller and report either 'ok:<result>' or 'err:<sqlstate>'.
-- SET ROLE happens inside the sub-block, so a failure rolls the role back with it.
-- ------------------------------------------------------------------------------------------
CREATE FUNCTION pg_temp.call_as(p_role text, p_sub uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('role', p_role, 'sub', p_sub)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql INTO v_out;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'ok:' || coalesce(v_out, '');
  EXCEPTION WHEN OTHERS THEN
    RETURN 'err:' || SQLSTATE;
  END;
END $$;

-- ==========================================================================================
-- 1. Grant matrix
-- ==========================================================================================
-- (a) service-role only
SELECT ok(NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
          AND has_function_privilege('service_role', f, 'EXECUTE'), 'service-role only: ' || f)
FROM unnest(ARRAY[
  'public.read_email_batch(text,integer,integer)',
  'public.enqueue_email(text,jsonb)',
  'public.delete_email(text,bigint)',
  'public.move_to_dlq(text,text,bigint,jsonb)',
  'public.public_complete_billing(uuid,text,numeric,text)',
  'public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date)',
  'public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)',
  'public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)',
  'public.trigger_records_request(uuid,uuid)'
]) AS f;

-- (b) signed-in: not anon, yes authenticated and service_role
SELECT ok(NOT has_function_privilege('anon', f, 'EXECUTE') AND has_function_privilege('authenticated', f, 'EXECUTE')
          AND has_function_privilege('service_role', f, 'EXECUTE'), 'signed-in only: ' || f)
FROM unnest(ARRAY[
  'public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)',
  'public.approve_invoice(uuid,uuid)',
  'public.approve_bill(uuid,uuid)',
  'public.lifecycle_send_back_onboarding(uuid,text,text)',
  'public.trigger_records_request(uuid)',
  'public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)',
  'public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)'
]) AS f;

-- PUBLIC holds EXECUTE on none of the 16 overloads.
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                  aclexplode(p.proacl) a
            WHERE n.nspname = 'public' AND a.grantee = 0 AND p.proname IN (
              'post_to_ledger','approve_invoice','approve_bill','record_invoice_payment','record_bill_payment',
              'read_email_batch','enqueue_email','delete_email','move_to_dlq','lifecycle_send_back_onboarding',
              'public_complete_billing','trigger_records_request','get_trial_balance_from_ledger')),
          0, 'PUBLIC holds EXECUTE on no A1 function');

-- Token columns: not anon, not authenticated; service_role yes.
SELECT ok(NOT has_column_privilege('anon', t, c, 'SELECT') AND NOT has_column_privilege('authenticated', t, c, 'SELECT')
          AND has_column_privilege('service_role', t, c, 'SELECT'), 'secret column hidden: ' || t || '.' || c)
FROM (VALUES ('public.bank_connections','access_token'), ('public.bank_connections','refresh_token'),
             ('public.connected_mailboxes','access_token'), ('public.connected_mailboxes','refresh_token'),
             ('public.connected_mailboxes','sync_cursor'), ('public.connected_mailboxes','scopes')) AS v(t, c);

-- Non-secret columns stay readable by authenticated (the app and the _safe views need them).
SELECT ok(has_column_privilege('authenticated', t, c, 'SELECT') AND NOT has_column_privilege('anon', t, c, 'SELECT'),
          'non-secret column readable by authenticated only: ' || t || '.' || c)
FROM (VALUES ('public.bank_connections','bank_name'), ('public.bank_connections','status'),
             ('public.connected_mailboxes','email_address'), ('public.connected_mailboxes','provider')) AS v(t, c);

SELECT ok(NOT has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE'), 'anon holds nothing on ' || t)
FROM unnest(ARRAY['public.bank_connections','public.connected_mailboxes',
                  'public.bank_connections_safe','public.connected_mailboxes_safe']) AS t;
SELECT ok(NOT has_table_privilege('authenticated', 'public.bank_connections', 'INSERT,UPDATE,DELETE'),
          'authenticated cannot write bank_connections');
SELECT ok(NOT has_table_privilege('authenticated', 'public.connected_mailboxes', 'INSERT,UPDATE')
          AND has_table_privilege('authenticated', 'public.connected_mailboxes', 'DELETE'),
          'authenticated may only DELETE (disconnect) connected_mailboxes');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_connections'
                        AND policyname = 'Portal clients can view their bank connections'),
          'portal SELECT policy on bank_connections removed');

-- ==========================================================================================
-- 2. Behaviour
-- ==========================================================================================
-- Fixtures: org X (user ux, owner) and org Y (uy_admin admin, uy_staff staff).
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'ux@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'uy.admin@example.test'),
  ('b0000000-0000-4000-8000-0000000000bc', 'uy.staff@example.test');
INSERT INTO public.organizations (id, name) VALUES
  ('a1000000-0000-4000-8000-00000000000a', 'Org X'),
  ('b1000000-0000-4000-8000-00000000000b', 'Org Y');
INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
  ('a1000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'owner'),
  ('b1000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', 'admin'),
  ('b1000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-0000000000bc', 'staff');
INSERT INTO public.clients (id, organization_id, first_name, last_name, email) VALUES
  ('c1000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b', 'Yvonne', 'Client', 'client.y@example.test');
INSERT INTO public.bookkeeping_accounts (id, organization_id, client_id, code, name, account_type, account_subtype, is_control_account, is_active) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', '1100', 'Debtors', 'ASSET', 'TRADE_DEBTORS', true, true),
  ('d1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', '4000', 'Sales', 'INCOME', NULL, false, true),
  ('d1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', '2100', 'Creditors', 'LIABILITY', 'TRADE_CREDITORS', true, true),
  ('d1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', '5000', 'Costs', 'EXPENSE', NULL, false, true);
INSERT INTO public.invoices (id, organization_id, client_id, invoice_type, contact_name, issue_date, due_date, status) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', 'SALES', 'Yvonne', current_date, current_date + 30, 'DRAFT');
INSERT INTO public.invoice_lines (invoice_id, line_number, description, unit_price, net_amount, gross_amount, account_id) VALUES
  ('e1000000-0000-4000-8000-000000000001', 1, 'Fees', 100, 100, 100, 'd1000000-0000-4000-8000-000000000002');
UPDATE public.invoices SET total_net = 100, total_vat = 0, total_gross = 100 WHERE id = 'e1000000-0000-4000-8000-000000000001';
INSERT INTO public.bills (id, organization_id, client_id, issue_date, due_date, status) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', current_date, current_date + 30, 'DRAFT');
INSERT INTO public.bill_lines (bill_id, line_number, description, unit_price, net_amount, gross_amount, account_id) VALUES
  ('f1000000-0000-4000-8000-000000000001', 1, 'Costs', 40, 40, 40, 'd1000000-0000-4000-8000-000000000004');
UPDATE public.bills SET total_net = 40, total_vat = 0, total_gross = 40 WHERE id = 'f1000000-0000-4000-8000-000000000001';
INSERT INTO public.onboarding_applications (id, organization_id, application_type, email, first_name, last_name, status) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', 'individual', 'applicant@example.test', 'App', 'Licant', 'for_review');
INSERT INTO public.jobs (id, organization_id, client_id, job_name, name, service_type) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', 'Accounts', 'Accounts', 'accounts');

-- Shared argument lists ---------------------------------------------------------------------
CREATE TEMP TABLE t_sql (k text PRIMARY KEY, q text) ON COMMIT DROP;
GRANT SELECT ON t_sql TO anon, authenticated, service_role;
INSERT INTO t_sql VALUES
 ('post', $q$SELECT public.post_to_ledger(
     p_organization_id := 'b1000000-0000-4000-8000-00000000000b',
     p_client_id := 'c1000000-0000-4000-8000-00000000000b', p_company_id := NULL,
     p_journal_date := current_date, p_reference := 'T', p_description := 'test',
     p_journal_type := 'JOURNAL', p_source_type := 'JOURNAL', p_source_id := NULL,
     p_created_by := 'b0000000-0000-4000-8000-00000000000b',
     p_entries := '[{"account_id":"d1000000-0000-4000-8000-000000000004","debit":10},
                    {"account_id":"d1000000-0000-4000-8000-000000000003","credit":10}]'::jsonb)::text$q$),
 ('approve_invoice', $q$SELECT public.approve_invoice('e1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b')::text$q$),
 ('approve_bill', $q$SELECT public.approve_bill('f1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b')::text$q$),
 ('send_back', $q$SELECT public.lifecycle_send_back_onboarding('a2000000-0000-4000-8000-000000000001', 'details', 'Please check')::text$q$),
 ('records', $q$SELECT public.trigger_records_request('a3000000-0000-4000-8000-000000000001'::uuid)::text$q$),
 ('pay_invoice9', $q$SELECT public.record_invoice_payment('e1000000-0000-4000-8000-000000000001', 1, current_date, NULL, NULL, 'r', 'bank', 'b0000000-0000-4000-8000-00000000000b', NULL)::text$q$);

-- anon: no JWT -> permission denied (42501) on every signed-in function
SELECT is(pg_temp.call_as('anon', NULL, (SELECT q FROM t_sql WHERE k = key)), 'err:42501', 'anon refused: ' || key)
FROM unnest(ARRAY['post','approve_invoice','approve_bill','send_back','records','pay_invoice9']) AS key;

-- anon on the service-only functions too
SELECT is(pg_temp.call_as('anon', NULL, sql), 'err:42501', 'anon refused: ' || label) FROM (VALUES
  ('read_email_batch', $q$SELECT count(*)::text FROM public.read_email_batch('auth_emails', 10, 30)$q$),
  ('enqueue_email', $q$SELECT public.enqueue_email('auth_emails', '{}'::jsonb)::text$q$),
  ('public_complete_billing', $q$SELECT public.public_complete_billing('a2000000-0000-4000-8000-000000000001', 'cs_x', 0, 'x')::text$q$),
  ('get_trial_balance_from_ledger', $q$SELECT count(*)::text FROM public.get_trial_balance_from_ledger('b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', NULL, current_date - 365, current_date)$q$)
) AS v(label, sql);

-- authenticated (any user) on service-only functions -> 42501
SELECT is(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-00000000000b', sql), 'err:42501', 'authenticated refused: ' || label) FROM (VALUES
  ('read_email_batch', $q$SELECT count(*)::text FROM public.read_email_batch('auth_emails', 10, 30)$q$),
  ('enqueue_email', $q$SELECT public.enqueue_email('auth_emails', '{}'::jsonb)::text$q$),
  ('delete_email', $q$SELECT public.delete_email('auth_emails', 1)::text$q$),
  ('move_to_dlq', $q$SELECT public.move_to_dlq('auth_emails', 'auth_emails_dlq', 1, '{}'::jsonb)::text$q$),
  ('public_complete_billing', $q$SELECT public.public_complete_billing('a2000000-0000-4000-8000-000000000001', 'cs_x', 0, 'x')::text$q$),
  ('get_trial_balance_from_ledger', $q$SELECT count(*)::text FROM public.get_trial_balance_from_ledger('b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', NULL, current_date - 365, current_date)$q$),
  ('trigger_records_request 2-arg', $q$SELECT public.trigger_records_request('a3000000-0000-4000-8000-000000000001'::uuid, NULL::uuid)::text$q$)
) AS v(label, sql);

-- Cross-tenant: owner of org X acting on org Y -> 42501 (post_to_ledger even with a forged
-- p_created_by naming an org-Y admin; approve_* even with a forged p_user_id)
SELECT is(pg_temp.call_as('authenticated', 'a0000000-0000-4000-8000-00000000000a', (SELECT q FROM t_sql WHERE k = key)),
          'err:42501', 'org X user refused on org Y: ' || key)
FROM unnest(ARRAY['post','approve_invoice','approve_bill','send_back','records']) AS key;
-- (The 8-arg payment overloads cannot be called positionally at all: with the 9-arg overload's
--  trailing DEFAULT present, an 8-argument call is ambiguous (42725). Their grants are asserted in
--  the matrix above.)

-- Wrong role inside the right org: staff cannot approve invoices or bills (owner/admin only)
SELECT is(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-0000000000bc', (SELECT q FROM t_sql WHERE k = key)),
          'err:42501', 'org Y staff refused: ' || key)
FROM unnest(ARRAY['approve_invoice','approve_bill']) AS key;

-- Correct member and role in org Y -> succeeds
SELECT ok(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-0000000000bc', (SELECT q FROM t_sql WHERE k = 'post'))
            LIKE 'ok:%"success": true%', 'org Y staff member can post_to_ledger (membership floor preserved)');
SELECT ok(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-00000000000b', (SELECT q FROM t_sql WHERE k = 'approve_invoice'))
            LIKE 'ok:%"success": true%', 'org Y admin can approve_invoice');
SELECT ok(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-00000000000b', (SELECT q FROM t_sql WHERE k = 'approve_bill'))
            LIKE 'ok:%"success": true%', 'org Y admin can approve_bill');
SELECT ok(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-0000000000bc', (SELECT q FROM t_sql WHERE k = 'send_back'))
            LIKE 'ok:%needs_client_action%', 'org Y member can lifecycle_send_back_onboarding');
-- trigger_records_request(uuid) and the 9-arg record_invoice_payment carry PRE-EXISTING schema
-- drift on London (jobs.service_id and invoice_payments.bank_account_id do not exist), so their
-- bodies fail with 42703 AFTER the identity guard. These two assert authorisation passed: the
-- result is neither a 42501 refusal nor a not_authorized result. See 006_CALLER_MAP.md §5.
SELECT ok(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-0000000000bc', (SELECT q FROM t_sql WHERE k = 'records'))
            NOT IN ('err:42501'), 'org Y member passes trigger_records_request authorisation');
-- The invoice is posted by now (approved above), so the 9-arg payment reaches its caller check.
SELECT ok(pg_temp.call_as('authenticated', 'a0000000-0000-4000-8000-00000000000a', (SELECT q FROM t_sql WHERE k = 'pay_invoice9'))
            LIKE '%not_authorized%', 'org X user refused on org Y: record_invoice_payment 9-arg');
SELECT ok((SELECT r NOT LIKE '%not_authorized%' AND r <> 'err:42501'
             FROM pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-0000000000bc', (SELECT q FROM t_sql WHERE k = 'pay_invoice9')) AS r),
          'org Y member passes record_invoice_payment (9-arg) authorisation');

-- The actor recorded is the caller, never the forged p_created_by
SELECT is((SELECT created_by FROM public.journals
            WHERE organization_id = 'b1000000-0000-4000-8000-00000000000b' AND reference = 'T'
            ORDER BY created_at DESC LIMIT 1),
          'b0000000-0000-4000-8000-0000000000bc'::uuid,
          'post_to_ledger records auth.uid() as created_by, ignoring p_created_by');

-- Service role (server code) is still trusted, and may name the actor
SELECT ok(pg_temp.call_as('service_role', NULL, (SELECT q FROM t_sql WHERE k = 'post')) LIKE 'ok:%"success": true%',
          'service_role can post_to_ledger');
SELECT ok(pg_temp.call_as('service_role', NULL, $q$SELECT count(*)::text FROM public.read_email_batch('auth_emails', 10, 30)$q$) LIKE 'ok:%',
          'service_role can read_email_batch');

-- Token columns, as a PostgREST caller would see them
INSERT INTO public.bank_connections (organization_id, client_id, provider, status, access_token, refresh_token, bank_name)
VALUES ('b1000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b', 'TRUELAYER', 'ACTIVE', 'secret-at', 'secret-rt', 'Test Bank');
SELECT is(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-00000000000b',
          $q$SELECT refresh_token FROM public.bank_connections LIMIT 1$q$), 'err:42501',
          'org admin cannot read bank_connections.refresh_token');
SELECT is(pg_temp.call_as('authenticated', 'b0000000-0000-4000-8000-00000000000b',
          $q$SELECT bank_name FROM public.bank_connections_safe LIMIT 1$q$), 'ok:Test Bank',
          'org admin can still read bank_connections_safe');
SELECT is(pg_temp.call_as('anon', NULL, $q$SELECT count(*)::text FROM public.bank_connections_safe$q$), 'err:42501',
          'anon cannot read bank_connections_safe');

SELECT * FROM finish();
ROLLBACK;

-- =============================================================================================
-- 006_verify.sql — LONDON ONLY (ezsvdsjdtardkxfswjvq). READ-ONLY grant matrix for increment 006.
-- =============================================================================================
-- Not a migration: it changes nothing. Two ways to run it, both read-only:
--
--   psql "$LONDON_DB_URL" -f docs/migration/london-increments/006_verify.sql
--       Runs inside a READ ONLY transaction and refuses to run otherwise ($pre$ / $post$).
--
--   supabase db query --remote --read-only "$(sed -n '/^WITH fn(sig, required)/,/^ORDER BY 1, 2, 3;/p' \
--       docs/migration/london-increments/006_verify.sql)"
--       The CLI's --read-only mode accepts a single SELECT/WITH statement only, so pass just the
--       matrix query; the CLI then enforces read-only itself.
--
-- Output: one row per (object, privilege) with what anon / authenticated / service_role hold,
-- whether PUBLIC holds EXECUTE (functions), and the value 006 requires. `ok` is false on any row
-- that does not match the post-006 requirement — so before 006 is applied, the false rows are
-- exactly the holes 006 closes; after it is applied, every row must be true.
-- Expected outputs (pre- and post-006) are recorded in 006_CALLER_MAP.md §6.
-- =============================================================================================

BEGIN;
SET TRANSACTION READ ONLY;

DO $pre$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION '006_verify must run in a read-only transaction';
  END IF;
END
$pre$;

WITH fn(sig, required) AS (VALUES
  ('public.read_email_batch(text,integer,integer)',                                   'service_role only'),
  ('public.enqueue_email(text,jsonb)',                                                'service_role only'),
  ('public.delete_email(text,bigint)',                                                'service_role only'),
  ('public.move_to_dlq(text,text,bigint,jsonb)',                                      'service_role only'),
  ('public.public_complete_billing(uuid,text,numeric,text)',                         'service_role only'),
  ('public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date)',                 'service_role only'),
  ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)',      'service_role only'),
  ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid)',         'service_role only'),
  ('public.trigger_records_request(uuid,uuid)',                                      'service_role only'),
  ('public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)', 'signed-in'),
  ('public.approve_invoice(uuid,uuid)',                                              'signed-in'),
  ('public.approve_bill(uuid,uuid)',                                                 'signed-in'),
  ('public.lifecycle_send_back_onboarding(uuid,text,text)',                          'signed-in'),
  ('public.trigger_records_request(uuid)',                                           'signed-in'),
  ('public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)', 'signed-in'),
  ('public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric)',    'signed-in')
),
fn_rows AS (
  SELECT 'function'::text AS kind,
         f.sig AS object,
         'EXECUTE'::text AS privilege,
         has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE') AS anon,
         has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE') AS authenticated,
         has_function_privilege('service_role', to_regprocedure(f.sig), 'EXECUTE') AS service_role,
         EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                  WHERE p.oid = to_regprocedure(f.sig) AND a.grantee = 0) AS public_grant,
         f.required
    FROM fn f
),
col(tbl, col, required) AS (
  SELECT 'public.' || c.table_name, c.column_name::text,
         CASE WHEN c.column_name IN ('access_token','refresh_token')
                OR (c.table_name = 'connected_mailboxes' AND c.column_name IN ('sync_cursor','scopes'))
              THEN 'service_role only' ELSE 'authenticated (not anon)' END
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name IN ('bank_connections','connected_mailboxes')
),
col_rows AS (
  SELECT 'column', c.tbl || '.' || c.col, 'SELECT',
         has_column_privilege('anon', c.tbl, c.col, 'SELECT'),
         has_column_privilege('authenticated', c.tbl, c.col, 'SELECT'),
         has_column_privilege('service_role', c.tbl, c.col, 'SELECT'),
         NULL::boolean,
         c.required
    FROM col c
),
tbl(tbl, priv, required) AS (VALUES
  ('public.bank_connections', 'INSERT', 'service_role only'),
  ('public.bank_connections', 'UPDATE', 'service_role only'),
  ('public.bank_connections', 'DELETE', 'service_role only'),
  ('public.connected_mailboxes', 'INSERT', 'service_role only'),
  ('public.connected_mailboxes', 'UPDATE', 'service_role only'),
  ('public.connected_mailboxes', 'DELETE', 'authenticated (not anon)'),
  ('public.bank_connections_safe', 'SELECT', 'authenticated (not anon)'),
  ('public.connected_mailboxes_safe', 'SELECT', 'authenticated (not anon)')
),
tbl_rows AS (
  SELECT 'table', t.tbl, t.priv,
         has_table_privilege('anon', t.tbl, t.priv),
         has_table_privilege('authenticated', t.tbl, t.priv),
         has_table_privilege('service_role', t.tbl, t.priv),
         NULL::boolean,
         t.required
    FROM tbl t
),
pol_rows AS (
  SELECT 'policy'::text AS kind,
         'public.bank_connections: Portal clients can view their bank connections'::text AS object,
         'present'::text AS privilege,
         NULL::boolean AS anon, NULL::boolean AS authenticated, NULL::boolean AS service_role,
         EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_connections'
                   AND policyname = 'Portal clients can view their bank connections') AS public_grant,
         'absent'::text AS required
),
allrows AS (
  SELECT * FROM fn_rows UNION ALL SELECT * FROM col_rows UNION ALL SELECT * FROM tbl_rows
)
SELECT kind, object, privilege, anon, authenticated, service_role, public_grant AS public_execute, required,
       CASE required
         WHEN 'service_role only' THEN NOT anon AND NOT authenticated AND service_role AND NOT coalesce(public_grant, false)
         WHEN 'signed-in' THEN NOT anon AND authenticated AND service_role AND NOT coalesce(public_grant, false)
         WHEN 'authenticated (not anon)' THEN NOT anon AND authenticated AND service_role
       END AS ok
  FROM allrows
UNION ALL
SELECT kind, object, privilege, anon, authenticated, service_role, public_grant, required, NOT public_grant
  FROM pol_rows
ORDER BY 1, 2, 3;

DO $post$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION '006_verify: transaction is no longer read-only';
  END IF;
END
$post$;

COMMIT;

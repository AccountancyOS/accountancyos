> **Legacy project retired 2026-11-11.** This document is a historical record and is kept as written.
> Production is the London project only; see `supabase/migrations_archive/README.md` and
> `docs/migration/london-increments/README.md`.

# Increment 006 — caller map, decisions and evidence

**Workstream:** cutover A — security containment · **Target:** London `ezsvdsjdtardkxfswjvq` only
**Status:** PENDING APPROVAL — nothing in this increment has been applied to London.
**Source of findings:** `03_Build_Audits/Module_Readiness_Assessment_2026-11-11.md` (top risks 1–4, 9; modules 7, 8, 10).

## 1. How the evidence was gathered

- **London, read-only.** Every live fact below comes from `supabase db query --remote --read-only`
  against London on 2026-11-11:
  - function signatures, ACLs, `prosrc` md5 and full `pg_get_functiondef`
  - callers: `pg_proc.prosrc` searched for each target name
  - triggers and `cron.job`
  - table/column grants, policies and view options
  - `select count(*) from auth.users` → **0**; `bank_connections` → 0 rows; `connected_mailboxes` → 0 rows
- **Local replica.** There is no Docker on this machine, so `supabase start` was not available. Instead:
  - A throwaway PostgreSQL 17.11 cluster was built in the session scratchpad. It has Supabase's roles (`anon`, `authenticated`, `service_role` BYPASSRLS, `authenticator`, `supabase_admin`), the GoTrue `auth.uid()/role()/email()/jwt()` definitions, and minimal `pgmq`/`pg_cron`/`pg_net`/`vault` stubs.
  - `london-baseline.sql`, `london-seed.sql` and increments 001–005 were loaded onto it.
  - **Fidelity check:**
    - all 16 target overloads match London exactly: signature, SECURITY DEFINER, `proconfig`, ACL and md5 of `pg_get_functiondef`
    - `bank_connections` / `connected_mailboxes` and both `_safe` views match exactly: ACL, policies, `reloptions`
    - the pre-006 verify matrix (59 rows) is byte-identical on London and on the replica
- **Frontend and edge callers.** Found by `grep` over `src/` and `supabase/functions/` for each name. For each edge caller, the Supabase client (user JWT vs service role) was read at its `createClient` line.

## 2. A1 — caller map and decision per function

Decision key:
- **(a)** service-role only: `REVOKE … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role`.
- **(b)** signed-in: `REVOKE … FROM PUBLIC, anon`. The actor is `auth.uid()`; a caller-supplied identity parameter is honoured **only** for `service_role`. A missing JWT or wrong organisation/role raises `42501` before any write.
- **(c)** stay anonymous: **none**. No caller proved a need.

No signatures change, so every caller keeps resolving to the same function. Nested calls from other SECURITY DEFINER functions are unaffected by the EXECUTE revokes, because Postgres checks EXECUTE against the calling function's owner (`postgres`). They do still pass through the new identity checks, which read the end user's JWT.

| Function (London signature) | Frontend (`src/`) | Edge functions (client) | SQL callers (all SECURITY DEFINER) | Triggers / cron | Decision | Why |
|---|---|---|---|---|---|---|
| `post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)` | `src/lib/posting-service.ts:107` — used by `payrun-service.ts:403`, `matching-service.ts`, `bank-rules-service.ts` | none | `apply_bank_match`, `apply_opening_balances`, `approve_bill`, `approve_credit_note`, `approve_invoice`, `dispose_fixed_asset`, `post_bank_transaction`, `post_bank_transfer`, `post_monthly_depreciation`, both `record_bill_payment`, both `record_invoice_payment`, `revalue_bank_account_fx`, `split_bank_transaction`, `void_bill`, `void_invoice` | none / none | **(b)**, role floor = organisation member | The frontend calls it directly, so it needs `authenticated`. Staff-permitted flows reach it (`can_match_payments` and `can_record_payments` include staff, `src/lib/permissions.ts:121,129`), so requiring `can_post_journals` (owner/admin) here would break them. That tightening belongs to the ledger-integrity workstream. Membership was already the intended rule (London body, "caller must belong to organization"); the hole was that the check was skipped when `v_actor` was NULL (anon) and that `p_created_by` was trusted. |
| `approve_invoice(uuid,uuid)` | `src/lib/invoice-service.ts:208` (`approveInvoice`). **No UI caller** — grep finds only the definition | none | `issue_invoice_safe` (`:357`, passes `auth.uid()`), `generate_recurring_invoice` | none | **(b)**, `can_issue_invoices` (owner/admin) | Matches the UI gate (`can_issue_invoices: ['owner','admin']`, `permissions.ts:111`) and `issue_invoice_safe`'s own check. |
| `approve_bill(uuid,uuid)` | `src/lib/bills-service.ts:198` ← `BillEditorDialog.tsx:270` | none | none | none | **(b)**, `can_approve_bills` (owner/admin) | Matches the UI gate (`can_approve_bills: ['owner','admin']`, `permissions.ts:117`). |
| `record_invoice_payment(…,uuid,numeric)` (9-arg) | `invoice-service.ts:245` ← `RecordPaymentDialog.tsx:88` (sends all 9 named args) | `portal-verify-invoice-payment:119` (**service role**, `p_user_id: null`) | none | none | **(b)**, grants only | The body already takes the actor from `auth.uid()` for non-service callers and returns `not_authorized` for non-members before any write (SEC-1, `20260705120000`). Only anon and PUBLIC needed removing. The role floor stays at membership, because the UI lets staff record payments. |
| `record_invoice_payment(…,uuid)` (8-arg) | none (the frontend sends 9 named args) | none | `record_invoice_payment_safe` (positional, 8 args) | none | **(a)** | No org check, and `p_user_id` is trusted. No direct caller needs it. |
| `record_bill_payment(…,uuid,numeric)` (9-arg) | `bills-service.ts:235` ← `RecordBillPaymentDialog.tsx:88` | none | none | none | **(b)**, grants only | Same body pattern as the invoice 9-arg. |
| `record_bill_payment(…,uuid)` (8-arg) | none | none | none | none | **(a)** | No caller anywhere. |
| `read_email_batch(text,int,int)` | none | `process-email-queue:607` (**service role**, `:573`) | none | none | **(a)**, plus `search_path=''` | Any signed-in user could read the `auth_emails` queue: password-reset links, i.e. account takeover. |
| `enqueue_email(text,jsonb)` | none | `auth-email-hook:255` (**service role**, `:240`) | none | none | **(a)**, plus `search_path=''` | Could be used to inject mail from the platform domain. |
| `delete_email(text,bigint)` | none | `process-email-queue:707,744` (service role) | none | none | **(a)**, plus `search_path=''` | Could be used to destroy other users' queued mail. |
| `move_to_dlq(text,text,bigint,jsonb)` | none | `process-email-queue:520` (service role) | none | none | **(a)**, plus `search_path=''` | Same as `delete_email`. |
| `lifecycle_send_back_onboarding(uuid,text,text)` | `src/pages/OnboardingDetail.tsx:112` (staff page) | none | none | none | **(b)**, organisation member | Same rule as `lifecycle_approve_onboarding` (`user_has_organization_access`). It was anon-callable and emailed any applicant in the practice's name. |
| `public_complete_billing(uuid,text,numeric,text)` | none | `onboarding-stripe-verify:64` (**service role**) | none | none | **(a)** | Its only caller is server code. It is **not** callable by the client, so `p_amount` can no longer come from a client. The edge function now supplies Stripe's own `session.amount_total`, only after verifying the session belongs to this application and is paid, and passes the applicant's token, never the database's copy. |
| `trigger_records_request(uuid)` | `src/lib/questionnaire-workpaper-service.ts:466` | none | none | none | **(b)**, organisation member | Staff action on a job, so membership. It was anon-callable and sent client email for any job. |
| `trigger_records_request(uuid,uuid)` | none | none | none | none | **(a)** | No caller. |
| `get_trial_balance_from_ledger(uuid,uuid,uuid,date,date)` | none (only named in `src/test/regression/tb-snapshot-lifecycle.test.ts`) | none | none on London (`create_tb_snapshot` exists only in an unapplied repo migration) | none | **(a)** | It had no membership check, so it allowed a cross-tenant TB read. No caller needs client access. A future SECURITY DEFINER caller (`create_tb_snapshot`) runs as the owner and is unaffected. |

### Effect on each caller

- **Frontend callers** keep working when the user has the required role:
  - `posting-service` (member)
  - `approveBill` (owner/admin — the UI already restricts it)
  - `recordInvoicePayment` / `recordBillPayment` (member, unchanged)
  - `lifecycle_send_back_onboarding` and `trigger_records_request` (member)

  All type-check against the unchanged generated types.
- **`p_user_id` / `p_created_by` sent by the frontend** are now ignored. The frontend always sends the signed-in user's own id, so nothing changes in practice.
- **Behaviour changes, all deliberate:**
  1. Staff can no longer reach `approve_invoice` / `approve_bill` directly. The UI never offered them this.
  2. `generate_recurring_invoice` (no UI caller) posts only when the caller can issue invoices.
  3. A direct `postgres` SQL session without a JWT is no longer trusted by the (b) functions. Server code must call them as `service_role`.
- **Edge callers:** all callers of (a) functions use the service-role client and keep working. `portal-verify-invoice-payment` calls the 9-arg payment as service role and keeps working.
- **Cron:** no cron job calls any A1 function (London `cron.job`: 12 jobs, all `net.http_post` to edge functions).

## 3. A1 — exact body changes

Generated from the live London `pg_get_functiondef` text by asserted exact replacement, so nothing else in these bodies changed.

#### `post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text)`

```diff
@@ -15,3 +15,3 @@
   v_lock_date date;
-  v_actor uuid := COALESCE(p_created_by, auth.uid());
+  v_actor uuid;
   v_is_admin boolean;
@@ -29,2 +29,26 @@
 BEGIN
+  -- ---- Caller identity (london_inc_006) -------------------------------------
+  -- The actor is the authenticated caller, never a parameter. p_created_by is honoured ONLY for
+  -- the service role (trusted server code that has authenticated its own caller). Refusals RAISE
+  -- 42501 from this OUTER block, so they cannot be swallowed by the posting block's
+  -- EXCEPTION handler and reported as an ordinary posting failure, and no audit row is written
+  -- into another organisation's log.
+  IF auth.role() = 'service_role' THEN
+    v_actor := p_created_by;
+  ELSE
+    v_actor := auth.uid();
+    IF v_actor IS NULL THEN
+      RAISE EXCEPTION 'post_to_ledger: not authenticated' USING ERRCODE = '42501';
+    END IF;
+  END IF;
+  IF v_actor IS NOT NULL AND p_organization_id IS NOT NULL
+     AND NOT EXISTS (
+       SELECT 1 FROM organization_users
+       WHERE organization_id = p_organization_id AND user_id = v_actor
+     ) THEN
+    RAISE EXCEPTION 'post_to_ledger: caller is not a member of the target organization'
+      USING ERRCODE = '42501';
+  END IF;
+
+  BEGIN
   -- ---- Header validations ---------------------------------------------------
@@ -258,2 +282,3 @@
                             'error_message', COALESCE(v_err_msg, SQLERRM));
+  END;
 END;
```

#### `approve_invoice(uuid,uuid)`

```diff
@@ -15,4 +15,15 @@
   v_post_result jsonb;
-  v_uid uuid := COALESCE(p_user_id, auth.uid());
+  v_uid uuid;
 BEGIN
+  -- ---- Caller identity (london_inc_006) -------------------------------------
+  -- Actor = auth.uid(); p_user_id is honoured ONLY for the service role.
+  IF auth.role() = 'service_role' THEN
+    v_uid := p_user_id;
+  ELSE
+    v_uid := auth.uid();
+    IF v_uid IS NULL THEN
+      RAISE EXCEPTION 'approve_invoice: not authenticated' USING ERRCODE = '42501';
+    END IF;
+  END IF;
+
   SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
@@ -20,2 +31,8 @@
     RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
+  END IF;
+
+  -- Role check against the row's own organisation (london_inc_006).
+  IF auth.role() IS DISTINCT FROM 'service_role'
+     AND NOT public.can_issue_invoices(v_uid, v_invoice.organization_id) THEN
+    RAISE EXCEPTION 'approve_invoice: caller lacks can_issue_invoices for this organization' USING ERRCODE = '42501';
   END IF;
```

#### `approve_bill(uuid,uuid)`

```diff
@@ -15,4 +15,15 @@
   v_post_result jsonb;
-  v_uid uuid := COALESCE(p_user_id, auth.uid());
+  v_uid uuid;
 BEGIN
+  -- ---- Caller identity (london_inc_006) -------------------------------------
+  -- Actor = auth.uid(); p_user_id is honoured ONLY for the service role.
+  IF auth.role() = 'service_role' THEN
+    v_uid := p_user_id;
+  ELSE
+    v_uid := auth.uid();
+    IF v_uid IS NULL THEN
+      RAISE EXCEPTION 'approve_bill: not authenticated' USING ERRCODE = '42501';
+    END IF;
+  END IF;
+
   SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
@@ -20,2 +31,8 @@
     RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
+  END IF;
+
+  -- Role check against the row's own organisation (london_inc_006).
+  IF auth.role() IS DISTINCT FROM 'service_role'
+     AND NOT public.can_approve_bills(v_uid, v_bill.organization_id) THEN
+    RAISE EXCEPTION 'approve_bill: caller lacks can_approve_bills for this organization' USING ERRCODE = '42501';
   END IF;
```

#### `lifecycle_send_back_onboarding(uuid,text,text)`

```diff
@@ -9,2 +9,7 @@
 BEGIN
+  -- ---- Caller identity (london_inc_006) -------------------------------------
+  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NULL THEN
+    RAISE EXCEPTION 'lifecycle_send_back_onboarding: not authenticated' USING ERRCODE = '42501';
+  END IF;
+
   SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
@@ -12,2 +17,8 @@
     RAISE EXCEPTION 'Onboarding application % not found', p_application_id;
+  END IF;
+
+  IF auth.role() IS DISTINCT FROM 'service_role'
+     AND NOT public.user_in_organization(auth.uid(), v_app.organization_id) THEN
+    RAISE EXCEPTION 'lifecycle_send_back_onboarding: caller is not a member of this organization'
+      USING ERRCODE = '42501';
   END IF;
```

#### `trigger_records_request(uuid)`

```diff
@@ -15,2 +15,7 @@
 BEGIN
+  -- ---- Caller identity (london_inc_006) -------------------------------------
+  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NULL THEN
+    RAISE EXCEPTION 'trigger_records_request: not authenticated' USING ERRCODE = '42501';
+  END IF;
+
   -- Get job
@@ -19,2 +24,8 @@
     RETURN jsonb_build_object('success', false, 'error', 'Job not found');
+  END IF;
+
+  IF auth.role() IS DISTINCT FROM 'service_role'
+     AND NOT public.user_in_organization(auth.uid(), v_job.organization_id) THEN
+    RAISE EXCEPTION 'trigger_records_request: caller is not a member of this organization'
+      USING ERRCODE = '42501';
   END IF;
```


## 4. A2 — token tables

| Column | bank_connections | connected_mailboxes | authenticated after 006 |
|---|---|---|---|
| `access_token`, `refresh_token` | secret | secret | **no** |
| `sync_cursor`, `scopes` | — | provider sync state / grant detail; not needed by any UI | **no** |
| `provider_connection_id` | was the first 32 chars of the access token (`truelayer-callback:192`) | — | yes, after the fix (`crypto.randomUUID()`; existing token-derived values are replaced by 006) |
| every other column | non-secret | non-secret | yes (SELECT only) |

Readers and writers (grep of `src/` and `supabase/functions/`):

- **Frontend:**
  - `connected_mailboxes_safe`: ComposeEmailDialog, EngagementLetterSection, ConversationsTab, filing-service, OpsHealth, Settings — non-secret columns only.
  - `connected_mailboxes` directly: `EmailProviderStep.tsx:25` (`id, email_address, provider, status`) and `Settings.tsx:189` (DELETE — disconnect). DELETE is kept for `authenticated`; RLS limits it to the caller's own mailbox.
  - `bank_connections` / `bank_connections_safe`: **no frontend reference at all**. That is why the portal SELECT policy is dropped and `authenticated` gets no write privilege.
- **Edge functions:**
  - Every token read or write already uses the service-role client: gmail-*/outlook-* callback/exchange/sync/send, truelayer-*, process-email-queue.
  - **One exception, fixed in this branch:** `send-engagement-letter` read `connected_mailboxes` with `select('*')` on the **user** client. After 006 that would fail on the revoked token columns, so it now selects `id, provider, email_address, status`.

## 5. Found, but out of scope — reported, not fixed

All verified on London or on the byte-identical replica on 2026-11-11.

1. **Recording an invoice payment is broken on London today.** This is pre-existing and not caused by 006.
   - The 9-arg `record_invoice_payment` inserts `invoice_payments.bank_account_id`, which does not exist on London (`information_schema`; error 42703 in the replica).
   - `record_invoice_payment_safe` (`src/lib/invoice-safe-service.ts:49`) fails on every call with `42725 function … is not unique`: its positional 8-argument call cannot choose between the 8- and 9-arg overloads.
   - So both payment paths are dead.
2. **`trigger_records_request(uuid)` is broken on London.** It reads `jobs.service_id`, which does not exist (42703 in the replica, after the 006 guard has passed). Records requests cannot be sent.
3. **Portal invoice issuing cannot post.** `issue_invoice_safe` permits portal users with `allow_invoice_send`, but `post_to_ledger` has always required org membership. 006 keeps that rule, so the outcome is unchanged.
4. **Other unchecked SECURITY DEFINER RPCs with the same caller-identity pattern** (audit module 7), not in this brief's list:
   - `generate_recurring_invoice(p_user_id)` — no auth check
   - `queue_filing_for_submission(p_user_id)`
   - `regress_filing_status`
   - `revoke_approval_with_audit`
   - `get_general_ledger_from_ledger`
   - `find_entities_by_email`
   - `mcp_list_*`
   - `void_invoice` / `void_bill` (member-only, not capability-checked)
5. **`can_record_payments` disagrees between the DB and the UI.** DB: owner/admin (`user_has_role_at_least 'manager'`). UI: owner/admin/staff. Not changed here.
6. **`lifecycle_send_back_onboarding` builds email HTML** from `p_step` / `p_reason` without escaping. It is now member-only, but still unescaped.
7. **CORS:**
   - `_shared/cors.ts` still answers `*` for origins not in `ALLOWED_ORIGINS`.
   - Many functions hard-code `Access-Control-Allow-Origin: *`.
   - `src/lib/app-config.ts:18-19` (frontend) still recognises `*.lovable.app`.
   - `infra/supabase-manifest.json` `redirectAllowList` still lists `accountancyos.lovable.app` (and `supabase-manifest.test.ts` pins it).
8. **`supabase/config.toml` `project_id`** still names the legacy project. Left untouched, because this brief puts the legacy project out of scope.
9. **Provider tokens in plaintext.** Gmail, Outlook and TrueLayer tokens are still stored unencrypted. 006 removes client read access; encryption at rest is still owed (`SECRETS.md` §3).
10. **Typecheck and CI.** `tsc -p tsconfig.app.json` reports 3 errors, all present on `main` too:
    - `email-attachments.test.ts:282`
    - `london-baseline-safety.test.ts:210-211`

    This is the likely cause of the red CI.

## 6. Grant matrix — `006_verify.sql`

### Current — London, read-only, 2026-11-11 (pre-006): 59 rows, **59 not ok**

| kind | object | privilege | anon | authenticated | service_role | PUBLIC execute | required | ok |
|---|---|---|---|---|---|---|---|---|
| column | public.bank_connections.access_token | SELECT | true | true | true |  | service_role only | false |
| column | public.bank_connections.bank_logo_url | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.bank_name | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.client_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.company_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.consent_expires_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.created_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.last_error | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.last_synced_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.organization_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.provider | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.provider_connection_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.refresh_token | SELECT | true | true | true |  | service_role only | false |
| column | public.bank_connections.scope | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.status | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.bank_connections.updated_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.access_token | SELECT | true | true | true |  | service_role only | false |
| column | public.connected_mailboxes.created_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.email_address | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.error_message | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.last_sync_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.mailbox_type | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.organization_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.provider | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.refresh_token | SELECT | true | true | true |  | service_role only | false |
| column | public.connected_mailboxes.scopes | SELECT | true | true | true |  | service_role only | false |
| column | public.connected_mailboxes.status | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.sync_cursor | SELECT | true | true | true |  | service_role only | false |
| column | public.connected_mailboxes.sync_enabled | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.token_expires_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.updated_at | SELECT | true | true | true |  | authenticated (not anon) | false |
| column | public.connected_mailboxes.user_id | SELECT | true | true | true |  | authenticated (not anon) | false |
| function | public.approve_bill(uuid,uuid) | EXECUTE | true | true | true | false | signed-in | false |
| function | public.approve_invoice(uuid,uuid) | EXECUTE | true | true | true | false | signed-in | false |
| function | public.delete_email(text,bigint) | EXECUTE | false | true | true | false | service_role only | false |
| function | public.enqueue_email(text,jsonb) | EXECUTE | false | true | true | false | service_role only | false |
| function | public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date) | EXECUTE | false | true | true | false | service_role only | false |
| function | public.lifecycle_send_back_onboarding(uuid,text,text) | EXECUTE | true | true | true | true | signed-in | false |
| function | public.move_to_dlq(text,text,bigint,jsonb) | EXECUTE | false | true | true | false | service_role only | false |
| function | public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text) | EXECUTE | true | true | true | true | signed-in | false |
| function | public.public_complete_billing(uuid,text,numeric,text) | EXECUTE | true | true | true | true | service_role only | false |
| function | public.read_email_batch(text,integer,integer) | EXECUTE | false | true | true | false | service_role only | false |
| function | public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) | EXECUTE | true | true | true | false | service_role only | false |
| function | public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) | EXECUTE | true | true | true | true | signed-in | false |
| function | public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) | EXECUTE | true | true | true | false | service_role only | false |
| function | public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) | EXECUTE | true | true | true | true | signed-in | false |
| function | public.trigger_records_request(uuid) | EXECUTE | true | true | true | true | signed-in | false |
| function | public.trigger_records_request(uuid,uuid) | EXECUTE | true | true | true | true | service_role only | false |
| policy | public.bank_connections: Portal clients can view their bank connections | present |  |  |  | true | absent | false |
| table | public.bank_connections | DELETE | true | true | true |  | service_role only | false |
| table | public.bank_connections | INSERT | true | true | true |  | service_role only | false |
| table | public.bank_connections | UPDATE | true | true | true |  | service_role only | false |
| table | public.bank_connections_safe | SELECT | true | true | true |  | authenticated (not anon) | false |
| table | public.connected_mailboxes | DELETE | true | true | true |  | authenticated (not anon) | false |
| table | public.connected_mailboxes | INSERT | true | true | true |  | service_role only | false |
| table | public.connected_mailboxes | UPDATE | true | true | true |  | service_role only | false |
| table | public.connected_mailboxes_safe | SELECT | true | true | true |  | authenticated (not anon) | false |

### Expected after applying 006 (local replica, baseline + 001–006): 59 rows, **all ok**

| kind | object | privilege | anon | authenticated | service_role | PUBLIC execute | required | ok |
|---|---|---|---|---|---|---|---|---|
| column | public.bank_connections.access_token | SELECT | false | false | true |  | service_role only | true |
| column | public.bank_connections.bank_logo_url | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.bank_name | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.client_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.company_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.consent_expires_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.created_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.last_error | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.last_synced_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.organization_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.provider | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.provider_connection_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.refresh_token | SELECT | false | false | true |  | service_role only | true |
| column | public.bank_connections.scope | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.status | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.bank_connections.updated_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.access_token | SELECT | false | false | true |  | service_role only | true |
| column | public.connected_mailboxes.created_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.email_address | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.error_message | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.last_sync_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.mailbox_type | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.organization_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.provider | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.refresh_token | SELECT | false | false | true |  | service_role only | true |
| column | public.connected_mailboxes.scopes | SELECT | false | false | true |  | service_role only | true |
| column | public.connected_mailboxes.status | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.sync_cursor | SELECT | false | false | true |  | service_role only | true |
| column | public.connected_mailboxes.sync_enabled | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.token_expires_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.updated_at | SELECT | false | true | true |  | authenticated (not anon) | true |
| column | public.connected_mailboxes.user_id | SELECT | false | true | true |  | authenticated (not anon) | true |
| function | public.approve_bill(uuid,uuid) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.approve_invoice(uuid,uuid) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.delete_email(text,bigint) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.enqueue_email(text,jsonb) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.get_trial_balance_from_ledger(uuid,uuid,uuid,date,date) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.lifecycle_send_back_onboarding(uuid,text,text) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.move_to_dlq(text,text,bigint,jsonb) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.post_to_ledger(uuid,uuid,uuid,date,text,text,text,text,uuid,text,numeric,uuid,jsonb,text,text) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.public_complete_billing(uuid,text,numeric,text) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.read_email_batch(text,integer,integer) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.record_bill_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid) | EXECUTE | false | false | true | false | service_role only | true |
| function | public.record_invoice_payment(uuid,numeric,date,uuid,uuid,text,text,uuid,numeric) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.trigger_records_request(uuid) | EXECUTE | false | true | true | false | signed-in | true |
| function | public.trigger_records_request(uuid,uuid) | EXECUTE | false | false | true | false | service_role only | true |
| policy | public.bank_connections: Portal clients can view their bank connections | present |  |  |  | false | absent | true |
| table | public.bank_connections | DELETE | false | false | true |  | service_role only | true |
| table | public.bank_connections | INSERT | false | false | true |  | service_role only | true |
| table | public.bank_connections | UPDATE | false | false | true |  | service_role only | true |
| table | public.bank_connections_safe | SELECT | false | true | true |  | authenticated (not anon) | true |
| table | public.connected_mailboxes | DELETE | false | true | true |  | authenticated (not anon) | true |
| table | public.connected_mailboxes | INSERT | false | false | true |  | service_role only | true |
| table | public.connected_mailboxes | UPDATE | false | false | true |  | service_role only | true |
| table | public.connected_mailboxes_safe | SELECT | false | true | true |  | authenticated (not anon) | true |

## 7. Behavioural evidence (local replica)

- **Clean apply.** `006_security_containment.sql` applies cleanly on top of baseline + seed + 001–005, and all post-assertions pass. A second apply is a no-op that also passes, so the increment is idempotent.
- **Refusal on drift.** With one target body altered before apply, 006 refuses with `006 precondition: body of public.delete_email(text,bigint) differs from the 2026-11-11 London capture`, and nothing is applied (anon still holds EXECUTE afterwards).
- **pgTAP.** `supabase/tests/006_security_containment.test.sql` reports **71/71 passing** after 006. Against the same replica *without* 006, **58 of 71 fail**, which shows the tests detect the holes. It covers:
  - the grant matrix
  - anon refused on every (b) and (a) function
  - an org-X owner refused on org-Y for every (b) function, including a forged `p_created_by` / `p_user_id`
  - org-Y staff refused on approve_invoice/approve_bill
  - the correct org-Y member/role succeeding
  - `journals.created_by` recording `auth.uid()`, not the forged id
  - service role still working
  - token columns unreadable and `_safe` views still readable

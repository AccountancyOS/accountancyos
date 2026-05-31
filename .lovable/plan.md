
# Plan: Wipe All Accountant Users & Firm Data

## Goal

Empty the backend of every accountant firm and user so you can sign up from scratch as the very first user. Greenfield and My Practice will be deleted too.

## What gets deleted

- **All 15 rows** in `public.organizations`
- **All 5 owner auth users** in `auth.users` (My Practice owner, Greenfield owner, both TestAccountants owners, the other TestAccountants owner)
- **The orphaned `leon@bluetickaccountants.com` auth user** so you can re-sign-up with that email
- **All per-org rows** in every tenant-scoped table (clients, companies, leads, jobs, deadlines, invoices, bills, ledger entries, journals, bank accounts, transactions, payroll, CIS, filings, workpapers, automation rules, chaser policies, org-specific email/job templates, portal access, OAuth tokens, HMRC/CH integration rows, branding, audit logs, etc.)
- **All storage objects** under `job-documents`, `onboarding-documents`, `engagement-letters`, `email-attachments`, and any other org-scoped bucket
- **Any portal client users** linked via `portal_access`

## What is preserved

- All **global system content**: 8 automation templates, 26 message templates, 8 workpaper templates, chart-of-accounts seed data, VAT codes, tax rates, payroll constants — none of these are org-scoped
- All **schema, RLS policies, triggers, functions, edge functions, migrations**
- All **infrastructure** (Stripe config, OAuth app credentials, secrets)

## Execution approach

Because of foreign keys and the `trg_prevent_signed_document_deletion` trigger, a naive `DELETE FROM organizations` will fail. The migration will:

1. Open a transaction
2. Temporarily disable the signed-document-protection trigger
3. For each org, cascade-delete in dependency order — child tables first, then parents, then `organizations` itself
4. Delete all rows in `auth.users` (Supabase cascades into `auth.identities`, `auth.sessions`, `auth.refresh_tokens` automatically)
5. Truncate storage objects in all org-scoped buckets
6. Re-enable the trigger
7. Commit

I'll use `TRUNCATE ... CASCADE` on a generated list of all tenant-scoped tables (filtered by presence of `organization_id` column) to make this exhaustive and resilient to schema additions, then explicitly clear the handful of tables that are user-scoped but not org-scoped (e.g. `portal_access`).

## Verification

After running, I'll confirm:
- `SELECT count(*) FROM organizations` → 0
- `SELECT count(*) FROM organization_users` → 0
- `SELECT count(*) FROM auth.users` → 0
- Spot-check 5 tenant tables (clients, jobs, leads, invoices, ledger_entries) → 0
- Spot-check 1 global table (e.g. `email_templates_global`) → unchanged count

## Risks

- **Irreversible.** No backup will be taken. You explicitly confirmed option 1.
- **Greenfield is gone.** If you later want a seeded test firm, we'll need to re-run the original Greenfield seed migration manually.
- **Stripe customers/subscriptions in Stripe itself are NOT deleted** — only the local `billing_status` and customer-id references. If you re-sign-up with the same email Stripe used previously, it may reuse the existing customer record. Not a blocker, just a heads-up.
- **Open OAuth grants on Gmail/Outlook/HMRC/Companies House** are revoked locally but the external providers still hold a grant until they expire or the user revokes them. Harmless.

## Post-wipe next step

You'll go to `/auth`, sign up fresh with `leon@bluetickaccountants.com`, receive the verification email (default Lovable sender), confirm, hit `/complete-payment` (Stripe test card `4242 4242 4242 4242`), then walk the onboarding wizard. You'll be the only user in the system.

## Files changed

| File | Action |
|---|---|
| `supabase/migrations/<timestamp>_wipe_all_tenant_data.sql` | New migration containing the destructive SQL |

No application code changes.

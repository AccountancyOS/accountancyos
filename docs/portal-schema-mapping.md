# Client Portal — Schema Mapping

Status legend:

- **TBD** — needs decision before Batch 2 wiring (none remaining as of Batch 2)
- **Adapt** — use existing accountant table/RPC as-is
- **RPC** — add a minimal SECURITY DEFINER RPC for the portal scope
- **New** — add a minimal new table (only when no existing object fits)
- **Disabled** — explicitly out of scope this sprint
- **Drop** — old portal concept dropped (mock, shadow, or duplicate)

| Portal Area | Old Expected Object | Accountant Backend Object | Action | Notes |
|-------------|---------------------|---------------------------|--------|-------|
| Tenant identifier | `firm_id` | `organizations.id` (referenced as `organization_id`) | Adapt | Drop the `firm_id` naming everywhere |
| Portal user ↔ client/company mapping | `client_users` | `portal_access` | Adapt | Existing table already models active/role + client/company scope |
| Accountant-side link to client | — | `accountant_client_links` | Adapt | Used to scope which accountant org owns a portal user's data |
| Entities visible to portal user | local `clients` + virtual `companies` | `clients` + `companies` joined via `portal_access` | Adapt | Honour `client_id` XOR `company_id` per portal_access row |
| Auth session | local Supabase project auth | Shared Supabase auth (this project) | Adapt | Single client; portal uses `@/integrations/supabase/client` |
| Invite acceptance | local invitation tables | `portal_access` rows + edge function `accept-portal-invite-signup` | Adapt | UI posts `{token, password, name}` to the existing edge fn; no portal-specific invite table |
| Tasks | local `tasks` | `client_tasks` WHERE `visibility='client_visible'` scoped to entity | Adapt | `job_tasks` stays internal — portal only ever shows client-visible items |
| Documents | local `documents` | Union of `job_documents` (`client_visible=true`, `archived=false`), `questionnaire_files`, `onboarding_documents` scoped to entity | Adapt | Signed URLs resolved on click via 15-min `createSignedUrl`; buckets: `job-documents`, `questionnaire-files`, `onboarding-documents` |
| Document folders | local `documents` folders | `document_folders` | Adapt | If folder grouping is exposed in portal UI |
| Questionnaire list | local `questionnaires` | `questionnaire_instances` scoped to entity | Adapt | `responseUrl = /questionnaire/:id?token=<access_token>` (existing public response page) |
| Questionnaire questions/answers | local `questionnaire_questions` + `questionnaire_answers` | `questionnaire_responses` (via existing public-link flow) | Adapt | Portal questionnaire response route 301s to the public response page; no fork |
| Conversations (threads) | `conversation_threads` | Derived grouping over `client_messages` (root = `parent_message_id IS NULL`) | Adapt | No threads table; client-side grouping. Unread counts return 0 in Batch 2 |
| Messages (read) | local `messages` | `client_messages` WHERE `visibility='client_visible'`, scoped to entity | Adapt | Existing RLS already filters reads to the portal user's entity |
| Messages (send) | local INSERT | RPC `public.portal_send_message(p_client_id, p_company_id, p_body, p_subject, p_parent_message_id)` | RPC | SECURITY DEFINER; re-validates `portal_access`; forces `sender_type='client'`, `visibility='client_visible'`, `sender_id=auth.uid()` |
| Payments / invoices | local `invoices`, `invoice_lines`, `payments` | `invoices` + `invoice_payments` scoped to entity | Adapt | Read-only; hosted-pay-link CTA deferred to Batch 3 (no `payment_link_url` column today) |
| Financial summary KPIs | local `financial_snapshots`, `monthly_financials` | Latest finalised `trial_balance_snapshots` + `portal_visibility_settings` | Adapt | Returns `asOf` + nulls until CoA-mapping helper is exposed in a portal-safe shape; visibility flags still drive which tiles render |
| Visibility flags | none | `portal_visibility_settings` | Adapt | Existing flags drive what the portal shows |
| Deadlines | local `deadlines` | `deadlines` | Adapt | Filter to client/company in portal scope |
| Bookkeeping read view | local `bookkeeping_accounts`, `ledger_entries`, `bank_accounts`, `bank_transactions` | Bookkeeping page only renders KPIs derived from TB + visibility flags | Adapt | Line-level reads stay deferred; all write paths remain disabled |
| Bookkeeping write paths | local `invoices/bills/payments/transactions` writes | — | Disabled | See `portal-disabled-features.md` |
| TrueLayer bank connection | local TrueLayer tables + edge fns | — | Disabled | See `portal-disabled-features.md` |
| Director's loan account | `directors_loan_accounts` | — | Drop | Not surfaced in the portal; revisit if a client explicitly requests it |
| Director insights / monthly financials | `monthly_financials` | — | Drop | Hardcoded trend % removed; only TB-derived KPIs are shown |
| Notification preferences | local `profiles` flags | — | Drop | UI removed; no per-portal-user persistence target exists |
| User profile | local `profiles` | `profiles` | Adapt | Name/avatar only; role lives in `user_roles` (accountant side) and `portal_access` (portal side) |
| Mock dashboard data | `mockData.ts` | — | Drop | No mock content in the portal |
| Hardcoded financial trends | dashboard `trend %` literals | Real derivation or hidden | Drop | Show neutral empty state until data is real |
| Activity feed | `ActivityFeed.tsx` mock | — | Drop | Removed; reintroduce only when a portal-safe event source exists |

## Process

1. Every row above is resolved; new portal features must add a row here before wiring.
2. Any **New** or **RPC** row requires a migration that follows the
   accountant project's RLS + GRANT conventions.
3. No portal service is allowed to query an unmapped row.

## Batch 2 migration summary

- Added `public.portal_send_message(uuid, uuid, text, text, uuid)` — SECURITY DEFINER, `EXECUTE` granted only to `authenticated`.
- No new tables, no new RLS policies on existing tables.
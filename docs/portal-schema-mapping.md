# Client Portal — Schema Mapping

Status legend:

- **TBD** — needs decision before Batch 2 wiring
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
| Invite acceptance | local invitation tables | `pending_practice_signups` + edge function `accept-portal-invite-signup` | TBD | Confirm whether a portal-specific invite table is required or if existing flow covers it |
| Tasks | local `tasks` | `job_tasks` (job-bound) and `client_tasks` (client-bound) | TBD | Decide union vs only `client_tasks`; portal must only see items flagged client-visible |
| Documents | local `documents` | `job_documents` + `questionnaire_files` + `engagement_letters` + `onboarding_documents` + `receipts` | TBD | Union view + signed URL helper; honour per-source visibility rules |
| Document folders | local `documents` folders | `document_folders` | Adapt | If folder grouping is exposed in portal UI |
| Questionnaire list | local `questionnaires` | `questionnaire_instances` | Adapt | Filter to instances assigned to the portal user's client/company |
| Questionnaire questions/answers | local `questionnaire_questions` + `questionnaire_answers` | `questionnaire_responses` (via existing public-link flow) | Adapt | Reuse existing token-based response page when possible |
| Conversations (threads) | `conversation_threads` | Grouping over `client_messages` | TBD | No dedicated threads table; group client_messages by job_id or thread_id. Add `RPC list_portal_conversations` if needed |
| Messages | local `messages` | `client_messages` | Adapt | Insert via RPC that enforces portal scope; do not allow free-form INSERT |
| Payments / invoices | local `invoices`, `invoice_lines`, `payments` | `invoices` + `invoice_lines` + `invoice_payments` | Adapt | Read-only in portal; "Pay" CTA links to existing payment-link flow |
| Financial summary KPIs | local `financial_snapshots`, `monthly_financials` | Derived from `ledger_entries` / `trial_balance_snapshots`, gated by `portal_visibility_settings` | TBD | Decide between live derivation and a cached snapshot table |
| Visibility flags | none | `portal_visibility_settings` | Adapt | Existing flags drive what the portal shows |
| Deadlines | local `deadlines` | `deadlines` | Adapt | Filter to client/company in portal scope |
| Bookkeeping read view | local `bookkeeping_accounts`, `ledger_entries`, `bank_accounts`, `bank_transactions` | Same accountant-side tables, read-only via portal-scoped RPC | TBD | All write paths stay disabled |
| Bookkeeping write paths | local `invoices/bills/payments/transactions` writes | — | Disabled | See `portal-disabled-features.md` |
| TrueLayer bank connection | local TrueLayer tables + edge fns | — | Disabled | See `portal-disabled-features.md` |
| Director's loan account | `directors_loan_accounts` | — | TBD | Decide if portal needs it; otherwise drop |
| Director insights / monthly financials | `monthly_financials` | Derivation over ledger | TBD | Likely drop hardcoded percentages, derive properly or hide |
| Notification preferences | local `profiles` flags | `email_preferences` (org-level) | TBD | Either bind real persistence or remove the UI |
| User profile | local `profiles` | `profiles` | Adapt | Name/avatar only; role lives in `user_roles` (accountant side) and `portal_access` (portal side) |
| Mock dashboard data | `mockData.ts` | — | Drop | No mock content in the portal |
| Hardcoded financial trends | dashboard `trend %` literals | Real derivation or hidden | Drop | Show neutral empty state until data is real |
| Activity feed | `ActivityFeed.tsx` mock | Real events or hidden | TBD | If kept, source from `audit_log` filtered to portal-visible events |

## Process

1. Before Batch 2 wiring starts, every **TBD** row must be resolved to an
   explicit action.
2. Any **New** or **RPC** row requires a migration that follows the
   accountant project's RLS + GRANT conventions.
3. No portal service is allowed to query an unmapped row.

# Client Portal Migration — Batch 2 (Schema Resolution + Service Wiring)

Batch 1 landed the isolated shell. Batch 2 resolves every `TBD` in `docs/portal-schema-mapping.md`, wires the stub services to real accountant tables, and lights up each portal page end-to-end. **No new tables are needed** — the existing schema (`portal_access`, `clients`, `companies`, `client_tasks`, `job_documents`, `questionnaire_instances`, `client_messages`, `invoices`, `portal_visibility_settings`) already covers every portal concept. One minimal SECURITY DEFINER RPC is added for safe message sending.

## Schema mapping (final resolutions)

All previously-TBD rows resolve to **Adapt** against existing tables. No `firm_id`, no `client_users`, no `conversation_threads`, no shadow bookkeeping.

| Portal Area | Backing Object | Notes |
|---|---|---|
| Tenant | `organizations.id` (`organization_id`) | |
| Portal user → entity mapping | `portal_access` (status='active', is_active=true) | RLS already allows `user_id = auth.uid()` |
| Entities | `clients` + `companies` joined via `portal_access` | client_id XOR company_id |
| Invite acceptance | existing edge fn `accept-portal-invite-signup` + `portal_access` rows | Wire UI to call the fn; no schema change |
| Tasks | `client_tasks` WHERE `visibility='client_visible'` AND entity scoped via portal_access | `job_tasks` stays internal |
| Documents (union view) | `job_documents` WHERE `client_visible=true`, `questionnaire_files`, `engagement_letters`, `onboarding_documents`, `kyc_pack_subjects` files | Signed storage URLs via `supabase.storage.from(bucket).createSignedUrl(path, 60*15)` |
| Questionnaires | `questionnaire_instances` filtered to portal user's entity | Reuse existing `/questionnaire/:instanceId` token page for response — portal page deep-links to it |
| Messages (list) | derived from `client_messages` grouped by `parent_message_id` root (or root id when null) | "Unread count" returns 0 for now; per-user read-receipt is a Batch 3 backlog item |
| Messages (send) | new RPC `portal_send_message(p_parent_message_id, p_body, p_subject)` (SEC_DEF) | Validates portal_access for the entity, forces `sender_type='client'`, `visibility='client_visible'`, `sender_id=auth.uid()` |
| Payments | `invoices` + `invoice_payments` scoped to entity | Read-only; "Pay" CTA opens existing payment link if `payment_link_url` present |
| Financial summary | `trial_balance_snapshots` (latest published) + `portal_visibility_settings` | Returns null fields when a flag is off |
| Visibility | `portal_visibility_settings` upsert-default on read | Align DTO field names (`showNetProfit`→`show_profit`, `showCorporationTaxEstimate`→`show_ct_estimate`) |
| Deadlines | `deadlines` filtered to entity | Surfaced inside dashboard widget |
| Bookkeeping (read) | If visibility allows: `bank_accounts`, `bank_transactions`, `invoices`, `bills` (display fields only) | All writes stay disabled |
| Notification prefs | UI stays removed (no `email_preferences` row per portal user) | Re-introduce only when there's somewhere to persist |
| Mock data / hardcoded trends / activity feed | Stays removed | Real data or empty state |

## Migration

One small migration adds the message-send RPC. No new tables, no new RLS on existing tables (existing policies already cover the read paths).

```sql
-- portal_send_message: portal user can post a reply or start a thread
-- against a client/company they have active portal_access to.
create or replace function public.portal_send_message(
  p_client_id uuid,
  p_company_id uuid,
  p_body text,
  p_subject text default null,
  p_parent_message_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_id   uuid;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if (p_client_id is null) = (p_company_id is null) then
    raise exception 'exactly one of client_id/company_id required';
  end if;
  if length(coalesce(p_body,'')) = 0 then raise exception 'body required'; end if;

  select organization_id into v_org
  from public.portal_access
  where user_id = v_user
    and status = 'active' and is_active = true
    and ((p_client_id is not null and client_id = p_client_id)
      or (p_company_id is not null and company_id = p_company_id))
  limit 1;

  if v_org is null then raise exception 'no portal access'; end if;

  insert into public.client_messages
    (organization_id, client_id, company_id, sender_id, sender_type,
     message_type, visibility, subject, content, parent_message_id)
  values
    (v_org, p_client_id, p_company_id, v_user, 'client',
     'message', 'client_visible', p_subject, p_body, p_parent_message_id)
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.portal_send_message(uuid,uuid,text,text,uuid) to authenticated;
```

## Service wiring (file-by-file)

All under `src/portal/services/` — replacing the Batch 1 stubs. Pages remain unchanged in shape but start receiving real data through TanStack Query hooks under `src/portal/hooks/`.

1. **portalContextService**
   - `getPortalUserContext()` → reads `auth.getUser()` + `portal_access` rows for the user (active only), returns `{userId, email, organizationId, access[]}`. PortalGuard now lets through when at least one active row exists.
   - `listPortalEntities()` → joins active `portal_access` to `clients` / `companies` for display.
   - `getPortalClientProfile()` → first/primary entity.
   - Adds `PortalEntityContext` (`src/portal/contexts/PortalEntityContext.tsx`) so multi-entity users can switch via the sidebar header.

2. **portalTasksService** → `client_tasks` WHERE entity scoped + `visibility='client_visible'`. Returns `PortalTask` ordered by `due_date, task_order`.

3. **portalDocumentsService** → union query (typed adapter) of `job_documents` (client_visible) + `questionnaire_files` + `engagement_letters` + `onboarding_documents`. `downloadUrl` resolved lazily via `createSignedUrl` when the user clicks download (15-min TTL). No bucket name hardcoding — reads from the existing accountant-side helper.

4. **portalQuestionnairesService** → `questionnaire_instances` for entity; `responseUrl` points at `/questionnaire/:instanceId?token=...` (existing public response page). No portal-specific response UI built; the questionnaire page lists + links out.

5. **portalMessagesService**
   - `listPortalConversations()`: select root `client_messages` (`parent_message_id IS NULL`) scoped to entity, left-joined to `max(created_at)` per thread. `unreadCount = 0` for now.
   - `listPortalMessages(threadId)`: root + descendants, ordered.
   - `sendPortalMessage(...)`: calls the new `portal_send_message` RPC.

6. **portalPaymentsService** → `invoices` + `invoice_payments` for entity, mapped to `PortalPayment`. `payUrl` from `invoices.payment_link_url` if present, else null.

7. **portalFinancialService** → loads `portal_visibility_settings` first; for each enabled flag pulls the matching aggregate from the latest `trial_balance_snapshots` row for the entity. Returns a summary with `null` for any disabled metric.

8. **portalVisibilityService** → reads `portal_visibility_settings`; if no row exists for the (org,entity) pair, returns a conservative all-false default (matches the existing 'show_trial_balance/ledger' defaults).

9. **DTO alignment** in `src/portal/types/index.ts`:
   - Rename `showNetProfit` → `showProfit`, `showCorporationTaxEstimate` → `showCtEstimate`.
   - Add `showReceivablesPayables`, `showInvoices`, `showTrialBalance`, `showDetailedLedger` to match the table.

## Pages — wire-up only (no UX redesign)

Each page imports a small `usePortalXxx` hook (TanStack Query) and renders real data, falling back to the existing `PortalEmptyState` when empty. No new component libraries.

- `PortalDashboard`: KPI tiles for tasks-due/messages/payments/deadlines (counts only).
- `PortalTasks`: simple list with status badge and due date.
- `PortalDocuments`: card grid; download button calls signed URL helper.
- `PortalQuestionnaires`: list with status + "Open" linking to existing response page.
- `PortalMessages`: thread list + message view + send composer (uses the new RPC).
- `PortalPayments`: invoice list with status, amounts, "Pay" CTA when `payUrl` exists.
- `PortalBookkeeping`: if `showBookkeeping`-equivalent visibility on, render KPI tiles from `portalFinancialService`; else the existing empty state. Strictly read-only.
- `PortalSettings`: shows entity name + signed-in email + change-password link (`supabase.auth.updateUser`). No notification toggles.

## Auth / invite

- `/portal/login`: unchanged from Batch 1 (already wired to `signInWithPassword`).
- `/portal/invite?token=...`: calls existing edge fn `accept-portal-invite-signup` with the token + a password (collected in the form). On success, signs in and redirects to `/portal/dashboard`. Surfaces clear errors for expired / already-accepted / revoked tokens.
- Password reset: portal login page links to the existing `/reset-password` route.
- PortalGuard upgrade: blocks accountant-app users who have an `organization_users` row but no `portal_access` row from landing in the portal — redirects to `/portal/login` with a message.

## Cross-surface guard

In Batch 2, accountant-side `ProtectedRoute` adds a single check: if the signed-in user has **only** `portal_access` (no `organization_users` row), redirect to `/portal/dashboard`. This prevents portal users from ever reaching accountant routes by accident. Impersonation/support mode for accountants stays a Batch 3 concern.

## Security checks

For every newly-wired path, verify before declaring done:

- `portal_access` RLS prevents reading other users' rows (already in place).
- All entity-scoped selects include `client_id` / `company_id` predicates derived from the user's active `portal_access` set — never raw `auth.uid()` joins to the entity tables.
- Storage downloads use signed URLs (15-min TTL); no direct public URLs.
- `portal_send_message` RPC re-validates portal_access on the server.
- `client_tasks.visibility='client_visible'` is mandatory in the query, not a UI filter.
- `job_documents.client_visible=true` is mandatory in the query.
- No portal call writes to `journals`, `journal_lines`, `ledger_entries`, `vat_*`, `bank_transactions`, `invoices` (writes), `bills` (writes).
- Run `supabase--linter` after the migration and resolve anything tied to the new RPC.

## Docs / memory updates

- Rewrite `docs/portal-schema-mapping.md` to replace TBDs with the resolutions above; each row gets the final action + the exact table / column predicates.
- Update `docs/portal-import-plan.md` "Out of scope" → move resolved items into a "Done in Batch 2" section.
- `docs/portal-disabled-features.md` unchanged (TrueLayer / writes / notifications still disabled).
- Memory: add `mem://portal/service-wiring-batch-2` summarising the final mappings and the single RPC, so future agents don't reinvent threads/tables.

## Acceptance criteria

- App compiles. Accountant routes unchanged.
- `getPortalUserContext` returns non-null for a seeded portal user → PortalGuard lets them through.
- Dashboard, Tasks, Documents, Questionnaires, Messages, Payments render real data scoped to the user's entity (or an empty state when there is none).
- Sending a message from the portal inserts a `client_messages` row with `sender_type='client'`, `visibility='client_visible'`, `sender_id=auth.uid()`.
- Invite flow: a fresh `portal_access` row in `status='invited'` with a valid `invite_token` can be completed via `/portal/invite?token=...`, ending with the user signed in on `/portal/dashboard` and the row flipped to `status='active'`.
- No portal write path touches the ledger / VAT / filings.
- `supabase--linter` clean for the new RPC.
- Mapping doc has zero remaining `TBD` rows.

## Out of scope (defer to Batch 3)

- Per-user read receipts / true unread counts on messages.
- Accountant impersonation/support mode.
- Portal-side write queue for bookkeeping.
- TrueLayer / bank connection.
- Notification preferences UI.
- Multi-entity switcher polish beyond a simple dropdown.

## Technical details

- New folder: `src/portal/hooks/` for `usePortalContext`, `usePortalEntities`, `usePortalTasks`, `usePortalDocuments`, `usePortalQuestionnaires`, `usePortalConversations`, `usePortalMessages` (per thread), `usePortalPayments`, `usePortalFinancialSummary`, `usePortalVisibility`. Each is a thin `useQuery`/`useMutation` wrapper over the service.
- New file: `src/portal/contexts/PortalEntityContext.tsx` — holds `currentEntity` + `setCurrentEntity`, persisted to `localStorage` keyed by user id.
- Storage helper: `src/portal/utils/storage.ts` exporting `getSignedUrl(bucket, path)` to keep TTL + error handling consistent.
- The RPC is created via `supabase--migration` (schema change), not the insert tool.
- No edits to `src/integrations/supabase/{client,types}.ts`; the regenerated types after migration pick up the new RPC automatically.

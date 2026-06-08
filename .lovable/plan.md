# TrueLayer Production Hardening Plan (Revised)

Treat as core production infrastructure. Sandbox stays available; live enabled via env. No hardcoded URLs, no silent failures, no cross-tenant leakage, no token exposure.

## 1. Centralised, override-friendly TrueLayer config

New `supabase/functions/_shared/truelayer-config.ts`:

- `getTrueLayerConfig()` reads:
  - `TRUELAYER_ENV` (`sandbox` | `live`) — required
  - `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET` — required
  - `TRUELAYER_PROVIDERS` — optional override (priority over env default)
  - `TRUELAYER_REDIRECT_URI` — optional override; otherwise `${SUPABASE_URL}/functions/v1/truelayer-callback`
- Returns `{ env, authBase, apiBase, providers, clientId, clientSecret, redirectUri }`.
- Throws typed `TrueLayerConfigError` with safe message (`Open Banking is not configured for this environment`) when any required secret is missing. Never logs secret values.
- Env defaults:
  - sandbox → `auth.truelayer-sandbox.com`, `api.truelayer-sandbox.com`, providers `uk-cs-mock uk-ob-all uk-oauth-all`
  - live → `auth.truelayer.com`, `api.truelayer.com`, default providers verified against current TrueLayer docs at build time; `TRUELAYER_PROVIDERS` always wins so we can change providers without redeploy.

Refactor `truelayer-auth`, `truelayer-callback`, `truelayer-sync` (and the new scheduled function) to use this module. Remove all hardcoded URLs.

## 2. Token storage audit (gate before further work)

Before changing schema, audit current storage of TrueLayer `access_token` / `refresh_token` on `bank_connections`:

- Confirm columns are not exposed via any RLS SELECT policy reachable by `authenticated` or portal users.
- If currently plaintext and reachable: lock down with policy denying SELECT on token columns to all roles except `service_role`, and route reads via a `security definer` RPC used only by edge functions. Prefer column-level revocation: `REVOKE SELECT (access_token, refresh_token, ...) ... ; GRANT SELECT (...non-token cols...) ...`.
- Tokens must never be returned to the frontend, never logged, never included in error payloads.

Flag explicitly in the PR if anything needs hardening here.

## 3. Auth-state row + reconnect semantics

Migrate `truelayer_auth_states` to carry full intent:

```
state (pk), organization_id,
client_id, company_id,
portal_user_id, accountant_user_id,
bank_connection_id NULL,
mode TEXT CHECK (mode IN ('connect','reconnect')) DEFAULT 'connect',
return_url, expires_at, created_at, used_at
```

Callback rules (enforced in `truelayer-callback`):

- `mode='connect'` → insert new `bank_connections` row scoped to org + entity.
- `mode='reconnect'` → update existing row ONLY IF:
  - `bank_connection_id` present and exists
  - belongs to same `organization_id`
  - belongs to same `client_id`/`company_id`
  - initiating user passes permission check (accountant in org, or portal user with `allow_bank_connect` on that entity)
- Any check fail → reject, redirect to safe failure URL, write audit log row.
- States are single-use (`used_at` set) and expire after 10 minutes.

## 4. Bank sync log table

New `public.bank_sync_logs`:

```
id, organization_id, bank_connection_id,
client_id, company_id,
started_at, completed_at,
status (running|success|partial|failed),
records_imported, records_updated,
error_code, error_message,         -- internal, accountant-visible
client_safe_message,               -- mapped, portal-visible
triggered_by (manual|scheduled|reconnect|callback),
triggered_by_user_id
```

Standard GRANTs, RLS:
- Accountant: org-scoped read.
- Portal: read via RPC only, returning a stripped projection (status, last sync time, `client_safe_message`).
- Write: `service_role` only.

## 5. Connection health: RPCs, not a broad view

Drop the idea of a public `bank_connection_status_v`. Replace with two `security definer` RPCs:

- `get_bank_connection_health_for_org(org_id)` — accountant only; enforces org membership; returns full detail across the practice.
- `get_bank_connection_health_for_entity(entity_type, entity_id)` — portal-callable; enforces `portal_can_access_bookkeeping(entity)` AND `portal_has_perm('show_bank_accounts', entity)`; returns simplified per-entity health.

Status derivation (shared SQL helper): `connected | expiring_soon (<=7d) | expired | disconnected | sync_failed | action_required`.

This guarantees the view layer cannot leak across tenants regardless of column-level access.

## 6. Portal permission granularity

Confirm/add separate flags on `portal_visibility_settings`:

- `show_bank_accounts` (existing)
- `show_bank_transactions` (new if missing — gates transaction list/explain)
- `allow_bank_connect` (existing)
- `allow_bank_manual_sync` (new)
- `allow_transaction_explain` (existing or new)

RLS on `bank_transactions` and the explain RPC must check `show_bank_transactions`, not `show_bank_accounts`.

## 7. Scheduled sync — protected, idempotent, bounded

New edge function `truelayer-sync-scheduled` (`verify_jwt = false`):

- Reads `CRON_SECRET`. Missing secret → function refuses to start. Missing/invalid `x-cron-secret` header → 401. Never log secret.
- Iterates active, non-expired `bank_connections` in bounded batches (configurable env `TL_SCHED_BATCH_SIZE`, default 25; `TL_SCHED_MAX_CONCURRENCY`, default 5).
- Per-connection try/catch; per-call timeout; rate-limit aware (honour TrueLayer 429s with backoff).
- Writes one `bank_sync_logs` row per connection per run (`triggered_by='scheduled'`).
- Deduplicates via stable provider IDs (see §10).

Cron setup performed via `supabase--insert` (NOT migration), wrapped idempotently:

```sql
select cron.unschedule('truelayer-hourly-sync')
  where exists (select 1 from cron.job where jobname='truelayer-hourly-sync');
select cron.schedule('truelayer-hourly-sync', '0 * * * *',
  $$ select net.http_post(
       url:='.../functions/v1/truelayer-sync-scheduled',
       headers:='{"x-cron-secret":"...","Content-Type":"application/json"}'::jsonb,
       body:='{}'::jsonb) $$);
```

Cadence is the cron schedule string — changeable without code edits. Documented in `docs/truelayer-production-readiness.md`.

## 8. Manual sync

Keep/expose:

- Accountant: button on connection card → invokes `truelayer-sync` with `triggered_by='manual'`.
- Portal: button visible only if `allow_bank_manual_sync = true`; same edge function path; permission re-checked server-side.

## 9. Error mapping

Shared mapper `mapTrueLayerError(err) → { internal_code, client_safe_message, status }`:

| Provider signal | Internal status | Client message |
|---|---|---|
| `invalid_grant` / token revoked | `action_required` | Reconnect required |
| consent expired | `expired` | Bank connection expired. Reconnect bank. |
| provider 5xx / unavailable | `sync_failed` | Sync failed — try later |
| 429 rate limited | `sync_delayed` | Sync delayed |
| config missing | `not_configured` | Open Banking is not configured |
| other | `sync_failed` | Sync failed — contact your accountant |

Accountant UI shows `internal_code` + `error_message`. Portal UI shows only `client_safe_message`. Never surface tokens/secrets in any path.

## 10. Data integrity constraints

Migration adds (or confirms):

- `bank_accounts`: UNIQUE `(bank_connection_id, provider_account_id)`
- `bank_transactions`: UNIQUE `(bank_account_id, provider_transaction_id)`
- `bank_connections`: UNIQUE `(organization_id, entity_key, provider, provider_connection_id)` where `entity_key = coalesce(client_id::text, company_id::text)`; allows intentional multiple consents only if `provider_connection_id` differs.

If TrueLayer transaction IDs ever rotate, document fallback identifier strategy (`meta` JSON + amount/date/desc hash) in the readiness doc.

## 11. Callback failure UX

`truelayer-callback` failure paths redirect to:

- Portal: `/portal/bookkeeping?tab=banking&connection=failed&reason=<code>`
- Accountant: `/bookkeeping?tab=banking&connection=failed&reason=<code>`

Banking tabs render:

> We couldn't connect your bank. Please try again or contact your accountant.

`reason` is a safe internal code only (no provider raw text, no token fragments).

## 12. UI surfaces

### Accountant
- `src/components/bookkeeping/BankingTab.tsx` — per-entity connection health card.
- New `src/components/bookkeeping/PracticeBankingOverview.tsx` mounted in `src/pages/Bookkeeping.tsx` — practice-wide list with filters (client, entity, status, expiring, failed); drill-down to `bank_sync_logs`.

### Portal
- `src/portal/components/bookkeeping/PortalBankingTab.tsx` — health banner above existing `BankingTab` using `get_bank_connection_health_for_entity`; reconnect CTA when expiring/expired (gated by `allow_bank_connect`); manual refresh button (gated by `allow_bank_manual_sync`).
- Client-friendly language only.

Shared hook `src/hooks/useBankConnectionHealth.ts` chooses the right RPC by surface.

## 13. RLS test matrix

Document and verify (in `docs/truelayer-production-readiness.md`):

- Client A cannot see Client B accounts/transactions/logs.
- Multi-entity portal user sees only linked entities.
- Revoked portal user loses access immediately.
- `allow_bank_connect=false` blocks connect and reconnect.
- `show_bank_accounts=false` blocks account list.
- `show_bank_transactions=false` blocks transaction list even if accounts visible.
- Tokens never returned to any non-`service_role` query.
- Reconnect cannot retarget another client's connection.

## 14. Acceptance criteria

Original 14 plus:

15. No duplicate cron jobs created on repeat builds.
16. Reconnect cannot overwrite another client/entity connection.
17. Tokens are never visible to portal or accountant frontend queries.
18. Health RPC does not leak other client bank data.
19. Manual sync works for accountant; gated for portal.
20. Callback failure redirects to safe URL with safe reason code.
21. Client sees only simplified sync errors; accountant sees detail.
22. Unique constraints prevent duplicate accounts/transactions.
23. `TRUELAYER_PROVIDERS` override changes behaviour without redeploy.
24. Scheduled function refuses to run without `CRON_SECRET`.

## Files

New:
- `supabase/functions/_shared/truelayer-config.ts`
- `supabase/functions/_shared/truelayer-errors.ts` (mapper)
- `supabase/functions/truelayer-sync-scheduled/index.ts`
- Migration: token column lockdown, `truelayer_auth_states` columns, `bank_sync_logs`, unique constraints, RPCs, granular portal perms.
- `src/hooks/useBankConnectionHealth.ts`
- `src/components/bookkeeping/BankConnectionHealthCard.tsx`
- `src/components/bookkeeping/PracticeBankingOverview.tsx`
- `src/portal/components/bookkeeping/PortalBankHealthBanner.tsx`
- `docs/truelayer-production-readiness.md`

Edited:
- `supabase/functions/truelayer-auth/index.ts` (config, mode, validation, audit-state fields)
- `supabase/functions/truelayer-callback/index.ts` (config, reconnect guards, failure redirect, log row)
- `supabase/functions/truelayer-sync/index.ts` (config, error mapper, log row, dedup verify)
- `supabase/config.toml` (add `truelayer-sync-scheduled` only)
- `src/components/bookkeeping/BankingTab.tsx`, `src/pages/Bookkeeping.tsx`
- `src/portal/components/bookkeeping/PortalBankingTab.tsx`

Secrets requested in build mode: `TRUELAYER_ENV`, `CRON_SECRET`, optional `TRUELAYER_PROVIDERS`, optional `TRUELAYER_REDIRECT_URI`. Existing `TRUELAYER_CLIENT_ID` / `TRUELAYER_CLIENT_SECRET` validated, not overwritten.

## Non-goals

- No changes to bookkeeping ledger, VAT, workpaper, or filing logic.
- No new bank-feed model for the portal — single shared schema.
- Sandbox testing remains fully functional; switch is env-driven only.

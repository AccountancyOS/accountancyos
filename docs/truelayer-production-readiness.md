# TrueLayer Production Readiness

## Environment toggle

- `TRUELAYER_ENV` = `sandbox` | `live` (required)
- `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET` (required)
- `TRUELAYER_PROVIDERS` (optional override, beats env default)
- `TRUELAYER_REDIRECT_URI` (optional override; default `${SUPABASE_URL}/functions/v1/truelayer-callback`)
- `CRON_SECRET` (required for scheduled sync; header `x-cron-secret`)
- `APP_PUBLIC_URL` (front-end origin used for callback redirects)

Defaults (`supabase/functions/_shared/truelayer-config.ts`):

| env     | authBase                              | apiBase                              | providers                          |
|---------|----------------------------------------|---------------------------------------|------------------------------------|
| sandbox | https://auth.truelayer-sandbox.com    | https://api.truelayer-sandbox.com    | uk-cs-mock uk-ob-all uk-oauth-all  |
| live    | https://auth.truelayer.com            | https://api.truelayer.com            | uk-ob-all uk-oauth-all             |

## TrueLayer console: required callback URLs

Whitelist on both sandbox and live apps:

- `${SUPABASE_URL}/functions/v1/truelayer-callback`

Permitted front-end origins for the post-callback redirect (controlled by `APP_PUBLIC_URL`):

- `https://app.accountancyos.com` (accountant)
- `https://client.accountancyos.com` (portal)
- Lovable preview domains (sandbox/testing only)

## Cron setup (idempotent — run via `supabase--insert`, not migration)

```sql
select cron.unschedule('truelayer-hourly-sync')
  where exists (select 1 from cron.job where jobname='truelayer-hourly-sync');
select cron.schedule(
  'truelayer-hourly-sync',
  '0 * * * *',
  $$ select net.http_post(
       url:='<SUPABASE_URL>/functions/v1/truelayer-sync-scheduled',
       headers:='{"x-cron-secret":"<CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
       body:='{}'::jsonb) $$
);
```

Cadence is the cron expression — change without code edits. Batch size and concurrency are env-tunable: `TL_SCHED_BATCH_SIZE` (default 25), `TL_SCHED_MAX_CONCURRENCY` (default 5).

## Security guarantees

- `access_token` and `refresh_token` columns on `bank_connections` have `SELECT` revoked from `anon` and `authenticated`. Only `service_role` (edge functions) can read them.
- `truelayer_auth_states` rows are single-use (`used_at` is set on callback) and expire after 10 minutes.
- Reconnect mode requires `bank_connection_id` and is rejected unless org and entity match the existing connection.
- Health is exposed via two SECURITY DEFINER RPCs, never a public view:
  - `get_bank_connection_health_for_org(org_id)` — accountant; org-membership gated.
  - `get_bank_connection_health_for_entity(client_id, company_id)` — portal; `portal_can_access_bookkeeping` + `portal_has_perm('show_bank_accounts')`.
- Errors flow through `mapTrueLayerError`: portal UI sees `client_safe_message` only; accountant UI sees `internal_code` + redacted `error_message`. No tokens or raw provider bodies leave the function.

## Portal permissions added

- `show_bank_transactions` (separate from `show_bank_accounts`)
- `allow_bank_manual_sync`

## QA matrix

1. Sandbox connection still works end-to-end.
2. Live `TRUELAYER_ENV` uses live auth URL.
3. Portal client with `allow_bank_connect=true` connects bank.
4. Portal client with `allow_bank_connect=false` cannot connect.
5. Portal client with `show_bank_accounts=true` sees accounts.
6. Portal client with `show_bank_accounts=false` does not see accounts.
7. Callback stores connection scoped to correct org/client/entity.
8. Manual sync imports accounts and transactions.
9. Scheduled sync imports without duplicates (provider-id upsert).
10. Reconnect CTA appears within 7 days of expiry (`derived_status=expiring_soon`).
11. Expired connection shows `action_required` / `expired`.
12. Sync failure logged in `bank_sync_logs` and visible to accountant.
13. Multi-entity portal user only sees the selected entity's bank data.
14. Revoked portal user immediately loses access.
15. No duplicate cron jobs created on repeat builds.
16. Reconnect cannot retarget another client's connection.
17. Tokens never returned to any non-`service_role` query.
18. Health RPC does not leak other client bank data.
19. Manual sync works for accountant; portal gated by `allow_bank_manual_sync`.
20. Callback failure redirects to safe URL with safe reason code only.
21. Client sees only `client_safe_message`; accountant sees detail.
22. Unique partial indexes prevent duplicate accounts/transactions.
23. `TRUELAYER_PROVIDERS` override changes behaviour without redeploy.
24. Scheduled function refuses to run without `CRON_SECRET` or with bad header.
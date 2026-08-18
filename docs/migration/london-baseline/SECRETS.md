# London secrets checklist

Derived from the **code**, not from `infra/supabase-manifest.json`. Generated 2026-08-18 by
scanning every `Deno.env.get()` across all 60 deployable Edge Functions (the generated `mcp`
function is excluded — it is not deployed to London) plus `import.meta.env.VITE_*` in `src/`.

**Set these yourself in the Supabase dashboard** — Project Settings → Edge Functions → Secrets,
or `supabase secrets set`. There is no MCP tool to write secrets, so they never need to pass
through a chat transcript.

---

## Why not use the manifest

`infra/supabase-manifest.json` is wrong in both directions and would leave you with a broken set:

- **Five names it declares are read by no function**: `COMPANIES_HOUSE_API_KEY`,
  `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`.
  Setting these achieves nothing — the code reads `CH_PROD_API_KEY`/`CH_TEST_API_KEY`,
  `GOOGLE_*` and `MICROSOFT_*`.
- **Names the code requires are absent from it.**

Regenerate the manifest from the built project rather than carrying it across.

---

## 1. DO NOT SET — Supabase injects these automatically (3)

| Name | Read by |
|---|---|
| `SUPABASE_URL` | 61 functions |
| `SUPABASE_ANON_KEY` | 18 functions |
| `SUPABASE_SERVICE_ROLE_KEY` | 54 functions |

Supabase provides these to every Edge Function at runtime. Setting them by hand is unnecessary
and risks pinning a stale value. **This corrects an earlier count of mine**: I previously listed
all 45 manifest names as needing to be set. The real number you must set is **31**.

## 2. RETIRE — do not carry across (2)

| Name | Read by | Note |
|---|---|---|
| `LOVABLE_API_KEY` | `auth-email-hook`, `process-email-queue` | Lovable Email dies with the migration |
| `LOVABLE_SEND_URL` | `process-email-queue` | ditto |

Both functions must be rewritten against the replacement provider, which will introduce its own
secret names (not yet chosen).

## 3. ROTATE — new value on London (1)

| Name | Read by | Note |
|---|---|---|
| `ENCRYPTION_KEY` | `_shared/hmrc-auth.ts`, `hmrc-callback`, `hmrc-vat-obligations` | Owner decision: ROTATE |

Protects **HMRC tokens only** — Gmail, Outlook and TrueLayer tokens are stored in plaintext — so
rotating forces HMRC re-authorisation and nothing else. While setting it, note the code currently
falls back to a published constant (`|| 'default-dev-key-change-in-production'`) and derives the
key by `padEnd(32).slice(0,32)`; both should be fixed in the function, not worked around here.

## 4. MUST BE NEW OR ENVIRONMENT-SPECIFIC (11)

These cannot simply be copied — they encode the old project or domain.

| Name | Read by | What it must become |
|---|---|---|
| `CRON_SECRET` | `truelayer-sync-scheduled` | **Must equal the Vault entry `cron_shared_secret`.** Different stores; conflating them is why the legacy hourly job 401'd forever. |
| `APP_URL` | `gmail-callback` | New app URL |
| `APP_PUBLIC_URL` | `_shared`, `onboarding-stripe-checkout`, `stripe-checkout` | New app URL |
| `PORTAL_PUBLIC_URL` | `_shared` | New portal URL |
| `ALLOWED_ORIGINS` | `_shared` | New domains. **Drop `*.lovable.app` / `*.lovableproject.com`** |
| `TRUELAYER_REDIRECT_URI` | `_shared` | Re-register at TrueLayer against the new domain |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | **New value.** Signing secrets are per-endpoint and cannot be copied — re-register the endpoint first |
| `PORTAL_SEED_SECRET` | `seed-portal-test-users` | New value (QA tooling) |
| `HMRC_MODE` | `cis-submit`, `rti-submit` | Confirm test vs production |
| `TRUELAYER_ENV` | `_shared` | Confirm sandbox vs live |
| `HMRC_AUTH_URL` | `_shared`, `hmrc-auth`, `hmrc-callback` | Confirm it matches `HMRC_MODE` |

## 5. CARRY — same value, provided the same third-party account is used (17)

| Service | Names |
|---|---|
| Companies House | `CH_PROD_API_KEY`, `CH_TEST_API_KEY` |
| HMRC | `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_CT_GATEWAY_ID`, `HMRC_CT_GATEWAY_PASSWORD` |
| Google (Gmail) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Microsoft (Outlook) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_TEAM` |
| TrueLayer | `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, `TRUELAYER_PROVIDERS` |

Tuning values, optional: `TL_SCHED_BATCH_SIZE`, `TL_SCHED_MAX_CONCURRENCY`.

**Redirect URIs still need re-registering** at Google, Microsoft, TrueLayer and HMRC even though
the client IDs and secrets carry over.

## 6. Vault entries — a different store (2)

Set in the database, not in Edge Function secrets:

| Vault name | Must equal |
|---|---|
| `cron_service_role_key` | the London service-role key |
| `cron_shared_secret` | the `CRON_SECRET` Edge Function env var above |

`london-cron.sql` refuses to apply unless both exist — deliberately, because a job that runs every
minute and 401s every minute manufactures the appearance of a working system.

## 7. Frontend build-time variables (3)

Not Supabase secrets — these are baked in at build time:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`

`vite.config.ts:7-8` currently hard-codes the **legacy** project ref with an anon-key fallback.
Change at cutover — changing it earlier breaks the legacy deployment.

---

## How completeness is proven

Static analysis proves a *name* is read. It cannot prove a *value* is present or correct — a
wrong Stripe webhook secret and a missing one look identical to a grep. So after setting them:

**Behavioural sweep.** Several functions fail closed with a distinctive signature when a secret is
missing — `truelayer-sync-scheduled` returns **503 `not_configured`** without `CRON_SECRET`.
Invoking each deployed function and looking for `not_configured`/503 responses is the check that
actually proves the set is complete. That is the same standard applied throughout this programme:
a green configuration screen is not evidence; a working call is.

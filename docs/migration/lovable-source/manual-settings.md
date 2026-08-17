# Settings that cannot be reconstructed from schema SQL

**Source project:** `moxpdejnucjjcplleefn` · **Captured:** 2026-08-17, read-only.
**Target project `ezsvdsjdtardkxfswjvq` was not accessed or configured.**

`live-schema.sql` reproduces database objects. Everything below lives in the Supabase control
plane, in Edge Function environment, in the Vault, or at a third party, and must be recreated by
hand on the target. **No value in this document is a secret — names and status only.**

A large part of this file reads `unavailable`. That is a finding, not an omission: the only
connector reaching the source project is scoped to the `public` schema, so `auth.*`, `storage.*`
and `vault.*` are unreachable, and the Supabase MCP connector is bound to a **different**
project (`vazeqolkxinsjvgzqrgj`). Everything marked unavailable needs one privileged capture —
a Management API token or service-role key for `moxpdejnucjjcplleefn` — before the target can be
built and validated.

---

## 1. Auth configuration — ALL UNAVAILABLE

None of the following could be read. Each must be captured from the source project's Dashboard
and re-entered on the target.

| Setting | Status | Note |
|---|---|---|
| Site URL | unavailable | `infra/supabase-manifest.json` declares a `siteUrl`; whether live matches is unverified |
| Redirect allow-list | unavailable | manifest declares `redirectAllowList`; `docs/supabase-infrastructure.md` mandates keeping `accountancyos.lovable.app`, which **must not** carry over |
| Enabled login providers | unavailable | Google and Microsoft OAuth are implied by the Gmail/Outlook secrets, but their enabled state is unverified |
| Email confirmation required | unavailable | |
| OTP expiry | unavailable | |
| Auth rate limits | unavailable | |
| CAPTCHA provider and status | unavailable | |
| Auth hooks (name, type, URL, enabled) | unavailable | `auth-email-hook` exists in git and the manifest declares `authEmailHook`; the live hook registration is unverified |
| SMTP vs managed email | unavailable | git shows Lovable Email API, not SMTP — see §4 |
| Sender name / sender domain | unavailable | |
| Secure email change | unavailable | |
| JWT expiry, refresh-token rotation and reuse interval | unavailable | |
| Auth user count | unavailable | no `auth.*` access; **no users, identities, passwords or tokens were read** |

---

## 2. OAuth provider registrations — external, must be re-registered

Each provider holds a callback URL bound to the **legacy** project. Every one needs a new
registration pointing at the target, done at the provider, not in Supabase. **Client secrets
are not recorded here and were never read.**

| Provider | Secret names in use | What must change |
|---|---|---|
| Google (Gmail sync) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (also legacy `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`, read by nothing) | Authorised redirect URI |
| Microsoft (Outlook sync) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (also legacy `OUTLOOK_CLIENT_ID`/`OUTLOOK_CLIENT_SECRET`, read by nothing) | Redirect URI |
| TrueLayer | `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, `TRUELAYER_REDIRECT_URI`, `TRUELAYER_ENV`, `TRUELAYER_PROVIDERS` | `TRUELAYER_REDIRECT_URI` is project-bound |
| HMRC | `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_AUTH_URL`, `HMRC_MODE`, `HMRC_CT_GATEWAY_ID`, `HMRC_CT_GATEWAY_PASSWORD` | Redirect URI is registered with HMRC; production recognition is a separate, unstarted gate |
| Companies House | `CH_PROD_API_KEY`, `CH_TEST_API_KEY` (also `COMPANIES_HOUSE_API_KEY`, read by nothing) | API keys are usually origin-bound |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_TEAM` | See §3 |

---

## 3. Stripe webhook configuration

- A webhook endpoint is registered at Stripe pointing at the legacy project's function URL. It
  must be re-registered against the target, and `STRIPE_WEBHOOK_SECRET` will be **a new value** —
  the signing secret is per-endpoint and cannot be copied.
- The three price IDs (`STRIPE_PRICE_SOLO`, `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_TEAM`) are
  account-level and carry over unchanged provided the same Stripe account is used.
- Live endpoint list and current signing-secret status: **unavailable** — not readable from here.
- Note the standing constraint that Stripe Connect onboarding state belongs to the Stripe
  account, not the Supabase project, and is unaffected by this migration.

---

## 4. Email — the largest single piece of manual work

**This has no Supabase equivalent and must be rebuilt, not migrated.**

- `auth-email-hook` and `process-email-queue` import `npm:@lovable.dev/email-js` and
  `npm:@lovable.dev/webhooks-js` and send through the Lovable Email API, using
  `LOVABLE_API_KEY` and `LOVABLE_SEND_URL`.
- Replacing it requires: a provider account, a verified sending domain with SPF and DKIM, a
  rewrite of both functions against the new provider's API, a new Auth *send-email* hook
  registration so branded auth mail still routes through the queue, and a re-test of the
  unsubscribe path (`handle-email-unsubscribe`).
- The queue mechanics themselves are database-side and DO carry over: `email_queue`, the atomic
  claim, and the `process-email-queue` cron job (jobid 86 live, `* * * * *`).
- `docs/supabase-infrastructure.md` claims this job runs "every 5 seconds". That is wrong —
  pg_cron has one-minute granularity. Do not carry the claim across.

---

## 5. Vault entries — names and presence only

| Vault name | Present live | Consumed by |
|---|---|---|
| `email_queue_service_role_key` | **true** (`vault_secret_exists`) | 8 of 13 cron jobs, as the bearer token. Despite the name it holds the general service-role key, not an email-specific one — renaming it is not migration-safe and is a known follow-up. |
| `CRON_SECRET` | **false** (`vault_secret_exists`) | live cron job `truelayer-sync-hourly` reads this exact name for its `x-cron-secret` header. It does not exist, so that job sends a null header and is rejected. See the drift report §5.2. |

**Enumeration of the Vault is unavailable** — `vault.*` is unreachable; only per-name presence
checks are possible. There may be entries not listed here.

On the target, the Vault copy of the service-role key must be created **before** any cron job
that reads it is scheduled — the DEF-003 migration deliberately refuses to apply otherwise,
because a job that runs every minute and 401s every minute manufactures the appearance of a
working drain.

---

## 6. Edge Function secrets — 45 names, no values

All must be set on the target before the corresponding functions are deployed. **Rotate rather
than copy** anything marked below.

- **Companies House** (3): `CH_PROD_API_KEY`, `CH_TEST_API_KEY`, `COMPANIES_HOUSE_API_KEY`
- **Gmail** (4): `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **HMRC** (6): `HMRC_AUTH_URL`, `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, `HMRC_CT_GATEWAY_ID`, `HMRC_CT_GATEWAY_PASSWORD`, `HMRC_MODE`
- **Outlook** (4): `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`
- **Stripe** (5): `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_TEAM`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Supabase-generated** (6): `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` — **all six are new values on the target; none may be copied.**
- **Vault copy** (1): `email_queue_service_role_key` — new value, see §5.
- **TrueLayer** (5): `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, `TRUELAYER_ENV`, `TRUELAYER_PROVIDERS`, `TRUELAYER_REDIRECT_URI`
- **TrueLayer tuning** (2): `TL_SCHED_BATCH_SIZE`, `TL_SCHED_MAX_CONCURRENCY`
- **Email provider** (2): `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` — **both retired**, replaced per §4
- **App config** (6): `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, `APP_URL`, `ENCRYPTION_KEY`, `PORTAL_PUBLIC_URL`, `PORTAL_SEED_SECRET`
- **Cron worker** (1): `CRON_SECRET`

### `ENCRYPTION_KEY` — DECISION: **ROTATE** (owner, 2026-08-17)

A new key is generated for London; existing test integrations are re-authorised.

**Correction to an earlier draft of this document.** It stated that `ENCRYPTION_KEY` is the
at-rest key for stored provider tokens generally, and that rotating it would break mailbox and
bank connections. **That was wrong.** Verified against the repository on 2026-08-17:

| Integration | Where the token is stored | Encrypted by `ENCRYPTION_KEY`? |
|---|---|---|
| HMRC | `hmrc-callback`, `hmrc-vat-obligations`, `_shared/hmrc-auth` | **Yes** — the only three call sites |
| Gmail | `connected_mailboxes.access_token` / `.refresh_token` | **No — plaintext** |
| Outlook | `connected_mailboxes.access_token` / `.refresh_token` | **No — plaintext** |
| TrueLayer | `bank_connections.access_token` / `.refresh_token` | **No — plaintext** |

`grep -l encrypt` across `gmail-*`, `outlook-*` and `truelayer-*` returns nothing; those
functions write raw tokens (`gmail-exchange/index.ts:133-134,161-162`,
`outlook-exchange/index.ts:125-126,151-152`, `truelayer-callback/index.ts:170`). Both columns
exist on the live tables.

**So rotation forces HMRC re-authorisation only.** Mailbox and bank tokens are unaffected by the
key — they are protected by RLS alone — and are being re-authorised anyway because no token rows
are restored.

**Two defects to fix in the target build, not to carry across** (recorded, not repaired):
- All three HMRC call sites use `Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production'`.
  With the variable unset, HMRC tokens are encrypted with a constant published in this
  repository. Whether it is set on the source is **[UNVERIFIED]** — Edge Function environment is
  not readable from here. The fallback must be removed so a missing key fails closed.
- The key is used as `padEnd(32,'0').slice(0,32)`, silently zero-padding a short key and
  truncating a long one. Replace with a proper KDF.
- Storing mailbox and bank tokens in plaintext is itself worth a decision for the target.

### Manifest secret drift

- Declared in `requiredSecrets` but read by no function (5): `COMPANIES_HOUSE_API_KEY`,
  `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`.
- Read in code but absent from `requiredSecrets`: **25**.

The manifest would therefore pass a completeness check while naming five secrets that do not
exist and omitting twenty-five that are required. It should be regenerated against the target
rather than carried across.

---

## 7. Storage — UNAVAILABLE, and git disagrees with itself

Live buckets, public/private status, file-size limits, MIME restrictions, storage RLS policies
and object counts are all **unavailable** (`storage.*` unreachable; `db_select` on
`storage.buckets` errors with `Could not find the table 'public.storage.buckets'`).
**No storage object was downloaded, listed or inspected.**

Git is internally inconsistent, so it cannot substitute:

- Created by migrations (8): `branding`, `filing-documents`, `invoice-branding`, `invoice-pdfs`,
  `job-documents`, `onboarding-documents`, `questionnaire-files`, `receipts`
- Referenced by RLS policies but created outside git (2): `client-documents`, `workpaper-files`
- Declared in `infra/supabase-manifest.json` (4): `email-assets`, `documents`, `filings`, `kyc`
  — **matching none of the above**

Requires a privileged read before anything is recreated.

---

## 8. Project-level settings — ALL UNAVAILABLE

| Setting | Status |
|---|---|
| SSL enforcement | unavailable |
| Network restrictions / IP allow-list | unavailable |
| Backups and PITR retention | unavailable — note the 2026-07-28 audit left Gate 7 (recoverability) at INSUFFICIENT EVIDENCE because no restore has ever been rehearsed |
| Security Advisor findings | unavailable for the source project — advisors were run only against the unrelated project the Supabase connector is bound to, and those results must not be cited |
| Database size | unavailable |
| Extensions | unavailable — `pg_cron` and `pg_net` are inferable from cron command text and must be enabled on the target before any cron migration runs |
| Compute size / region | unavailable — the target is stated as London |
| pgmq queues | unavailable — own schema, unreachable |
| Publications / Realtime membership | unavailable |

---

## 9. Lovable-controlled capabilities with no Supabase equivalent

| Capability | Consequence on migration |
|---|---|
| Lovable Email API | Rebuild — §4 |
| `sandbox_exec` managed login role | **Do not recreate.** Four migrations alter it, none creates it, and DEF-031 exists because platform automation kept restoring `BYPASSRLS` on it. |
| Lovable migration executor | Re-timestamps and re-authors every migration (473 of 528 files). Once gone, git becomes the migration source of truth and the receipt convention's applied-escape is no longer needed. |
| `*.lovable.app` / `*.lovableproject.com` CORS trust | Present in `accept-portal-invite-signup`, `portal-pay-invoice`, `stripe-checkout`, `onboarding-stripe-checkout`. Must be rewritten to the real domain; leaving them is an open origin. |
| `@lovable.dev/cloud-auth-js`, `@lovable.dev/mcp-js`, `lovable-tagger`, `mcpPlugin()` | Frontend build and auth-client coupling to remove. |
| Generated `supabase/functions/mcp/index.ts` | Build output, in neither `config.toml` nor the manifest, and the only function file with a hard-coded legacy project ref (line 523). |
| Lovable app hosting | The frontend needs a new host; `vite.config.ts:7` hard-codes the legacy ref with an anon-key fallback on line 8. |

---

## 10. The Lovable export route — what it gives and what it does not

From Lovable's advanced-settings documentation, read 2026-08-17. **[VENDOR DOC]** — not verified
against this project's own export, which has not been run.

| Capability | Detail |
|---|---|
| *Export project data* | "contains your full database, both structure and data" |
| **Excludes** | **storage files, edge functions, secrets, and user passwords** |
| Limits | 5 GB cap; one export per 24 hours |
| After Cloud removal | export is **no longer downloadable** |
| *Remove Lovable Cloud* | "permanently deletes your Cloud instance and cannot be undone" |
| *Pause Cloud* | suspends database, auth, storage and Edge Functions; storage usage still accrues |
| Transfer tooling | "Lovable does not provide a one-click transfer from the built-in backend (Cloud) to Supabase" |

**This closes most of the unavailable list above** — the export's structure half supplies the
CHECK/FK/exclusion constraints, views, sequences and extensions that no connector here could
read. It does **not** supply anything in §1 (Auth configuration), §7 (storage) or §8
(project-level settings): those remain Dashboard captures.

### The password/email ordering trap

User passwords are not exported, so every Auth user must reset on the target. The reset email
is sent through Lovable Email (§4), which does not survive the migration. **The replacement
email provider must therefore be live, domain-verified and tested on the target before cutover**
— otherwise users cannot log in and cannot recover. If the "all current data is test data"
premise holds, this is moot and users are simply reseeded; that premise should be confirmed
explicitly rather than assumed.

### Sequencing that cannot be undone

1. Export **before** anything is removed — it is unavailable afterwards.
2. Verify the target fully (§10 below) **before** removing Lovable Cloud.
3. Confirm the database fits under 5 GB. Database size is **unavailable** in this pack, so this
   is unverified.

---

## 11. What must be verified on the target before it is trusted

Not instructions to act now — the acceptance list for whoever builds it.

1. A privileged `pg_dump --schema-only` of the source, diffed against `live-schema.sql`, with
   every CHECK, FK, exclusion constraint, view, sequence and extension present in the dump and
   absent here accounted for.
2. RLS enabled on all 226 tables and all 688 policies present, verified with **real
   authenticated users of two different organisations** — never through a role that could
   bypass RLS.
3. All 13 cron jobs present, each with a working credential, and each verified by an actual
   2xx delivery rather than a green pg_cron run.
4. An enqueued email delivered end to end through the replacement provider.
5. No role with `rolbypassrls` and `rolcanlogin`.
6. `/version` reporting the deployed commit SHA, so git-versus-live identity is answerable —
   the gap DEF-020 has been open on since July.

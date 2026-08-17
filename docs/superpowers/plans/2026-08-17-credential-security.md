# Credential & Secret Security — Target-Build Remediation Plan

> **Status: PLAN ONLY.** Nothing in this document has been executed. No code was changed, no
> migration written, no database contacted, no secret read or set. The legacy Lovable backend
> (`moxpdejnucjjcplleefn`) was not touched; the target project was not accessed or referenced.

**Goal:** the new London Supabase project starts with no credential defect that the legacy
backend carries — no literal token in a catalog table, no provider token in plaintext, no
encryption key that falls back to a published constant, no manifest that certifies secrets it
does not check.

**Evidence base:** `docs/migration/lovable-source/drift-report.md` §5.1–§5.5 and §6,
`docs/migration/lovable-source/manual-settings.md` §5–§6, `docs/migration/lovable-source/README.md`.
Every claim below about code was re-verified against the repository on 2026-08-17 and cites
`file:line`. Claims that could not be verified are marked **[UNVERIFIED]** and are never
presented as fact.

**Scope boundary:** this plan governs the *target build*. It repairs nothing on the legacy
project. The four live 401ing cron jobs (drift-report §5.2) stay broken there; they are fixed by
being rebuilt correctly, not by being patched.

---

## 0. Verification pass — what held, what was understated

Each stated finding was re-checked. Results:

| # | Finding | Verdict |
|---|---|---|
| 1 | Five cron jobs embed a literal anon JWT; other eight read `email_queue_service_role_key` from Vault | **[LIVE] — accepted, not independently re-verifiable here.** No database was contacted for this plan. The claim rests on drift-report §5.1 and README "Live defects found during capture" #3. Git corroborates the *vault* half: `supabase/migrations/20260817100000_def_003_reinstate_email_queue_drain.sql` schedules `process-email-queue` with `'Bearer ' \|\| (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)`. The literal-JWT half is a live reading only. |
| 2 | Gmail/Outlook/TrueLayer tokens written in plaintext at three functions | **CONFIRMED, and materially understated — see §0.1.** |
| 3 | `ENCRYPTION_KEY` used by exactly three call sites with a published fallback and `padEnd/slice` | **CONFIRMED exactly.** `grep -rn ENCRYPTION_KEY supabase infra src` returns 8 lines across exactly 3 files: `hmrc-callback/index.ts:13,24`, `hmrc-vat-obligations/index.ts:16,29,51`, `_shared/hmrc-auth.ts:12,31,59`. All three use `Deno.env.get('ENCRYPTION_KEY') \|\| 'default-dev-key-change-in-production'` then `.padEnd(32,'0').slice(0,32)`. |
| 4 | Vault secret `CRON_SECRET` does not exist though `truelayer-sync-hourly` reads that name | **[LIVE] — accepted.** The git half is confirmed: `truelayer-sync-scheduled/index.ts:13` reads `Deno.env.get("CRON_SECRET")` and lines 174–178 reject any request whose `x-cron-secret` header does not match, as the first statement in the handler. The Vault-absence half is a live `vault_secret_exists` reading (manual-settings §5) not reproducible here. |
| 5 | `email_queue_service_role_key` holds the general service-role key | **[LIVE] — accepted** (manual-settings §5). Git is consistent with it: `infra/supabase-manifest.json` `requiredVaultSecrets` names it, and 8 of 13 live jobs use it as a general bearer, which an email-specific key could not serve. |
| 6 | `vite.config.ts:7` hard-codes the legacy ref with an anon-key fallback on line 8 | **CONFIRMED.** Line 7 `const cloudProjectId = "…"`, line 8 `const cloudAnonKey = "eyJ…"` (a decodable anon JWT for the legacy ref, `exp` 2079), line 9 builds `cloudUrl` from it. Both are fallbacks inside `define:` at lines 19–21, so they are compiled into the bundle whenever `process.env.VITE_SUPABASE_*` is unset at build time. |
| 7 | 5 manifest secrets read by nothing; 25 read-in-code names absent from `requiredSecrets` | **CONFIRMED arithmetically.** `requiredSecrets` has 16 entries. `Deno.env.get('X')` across `supabase/functions` yields **36** distinct names. Intersection = 11. 16 − 11 = **5 unread** (`COMPANIES_HOUSE_API_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`). 36 − 11 = **25 undeclared**. |
| 8 | `sandbox_exec` carries BYPASSRLS and must not be recreated | **[UNVERIFIED live; GIT confirmed in part.]** 11 migrations reference the role and none creates it. The BYPASSRLS attribute rests on a repo record (`docs/audits/2026-08-06-def-031-platform-escalation.md`), not a live read — drift-report §3.3 says so explicitly. The *recommendation* stands regardless: do not recreate. |
| 9 | 45 distinct secret names | **CONFIRMED.** manual-settings §6 groups sum to 3+4+6+4+5+6+1+5+2+2+6+1 = 45, and reconcile against code: 36 Edge names + 3 `VITE_SUPABASE_*` + `email_queue_service_role_key` = 40 read somewhere, + the 5 read by nothing = 45. |

### 0.1 Correction — the plaintext-token blast radius is four times larger than stated

The brief and drift-report §5.3 cite three write sites. There are **at least twelve write sites
across eight functions**, plus six decrypt-side read sites. Verified by
`grep -n "access_token:\|refresh_token:"` over the provider functions:

| Function | Plaintext token writes |
|---|---|
| `supabase/functions/gmail-exchange/index.ts` | 133–134 (update), 161–162 (insert) |
| `supabase/functions/gmail-callback/index.ts` | 127–128 (update), 155–156 (insert) |
| `supabase/functions/gmail-sync/index.ts` | 274 (refresh writeback, access token only) |
| `supabase/functions/gmail-send/index.ts` | 240 (refresh writeback, access token only) |
| `supabase/functions/outlook-exchange/index.ts` | 125–126 (update), 151–152 (insert) |
| `supabase/functions/outlook-callback/index.ts` | 113–114 (update), 136–137 (insert) |
| `supabase/functions/outlook-sync/index.ts` | 222–223 (refresh writeback) |
| `supabase/functions/outlook-send/index.ts` | 160–161 (refresh writeback) |
| `supabase/functions/truelayer-callback/index.ts` | 170–171 (reconnect update), 194–195 (insert) |
| `supabase/functions/truelayer-sync/index.ts` | 48–49 (refresh writeback) |
| `supabase/functions/truelayer-sync-scheduled/index.ts` | 59–60 (refresh writeback) |

Corresponding **read** sites that would need a decrypt call: `gmail-sync/index.ts:51`,
`gmail-send/index.ts:45`, `outlook-sync/index.ts:69`, `outlook-send/index.ts:41`,
`truelayer-sync/index.ts:34`, `truelayer-sync-scheduled/index.ts:50` — each passes a stored
`refresh_token` straight to the provider's token endpoint.

**Consequence for this plan:** an encrypt-at-rest decision is not a three-file change. It is a
shared helper plus edits in **eleven** functions, and every one of them must be changed in the
same release or a half-encrypted column results. This raises the weight of §2 considerably.

Also noted during verification, and not previously recorded anywhere: **`VITE_APP_URL`** is read
at `src/lib/app-config.ts:26` and appears in neither the 45-name list nor `requiredSecrets`. It
is a 46th configuration name. Not a secret, but it belongs in the reconciliation of §5.

---

## 1. Rotation matrix — all 45 secret names

**Category definitions** (chosen so every name lands in exactly one):

- **ROTATE** — a value exists at an issuer we control, is still needed, and must be *deliberately
  regenerated* so the legacy value is invalidated. The old value has lived in a Lovable-managed
  environment we cannot audit.
- **CARRY** — the same value is valid on the target and may be re-entered unchanged. Identifiers,
  mode flags, base URLs, account-level IDs. Not secret, or secret but not project-bound.
- **RETIRE** — not set on the target at all. Either read by no code, or the service is gone.
- **NEW-VALUE-REQUIRED** — there is no old value to rotate. The value is a *consequence* of the
  target project or a new endpoint existing, and cannot be known before it does.

**Totals: ROTATE 10 · CARRY 14 · RETIRE 7 · NEW-VALUE-REQUIRED 14 = 45.**

### 1.1 ROTATE (10)

| Secret | Reason |
|---|---|
| `CH_PROD_API_KEY` | Live Companies House production key. Held in an environment we cannot audit; CH keys are commonly restricted by origin/domain, and the origin changes. |
| `CH_TEST_API_KEY` | Same issuer and same exposure. Lower risk — **owner may downgrade to CARRY** if the sandbox key carries no origin restriction (§9.8). |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. Google permits issuing a new secret on the existing client, so the client ID can be carried while the secret is rolled. |
| `HMRC_CLIENT_SECRET` | Regenerate in the HMRC developer hub. Gated on §9.1 — if a *new* HMRC application is created, this becomes NEW-VALUE-REQUIRED instead. |
| `HMRC_CT_GATEWAY_PASSWORD` | A Government Gateway password that has sat in a third-party-managed env. Rotation is done at the Gateway and may affect other consumers — **owner-coordinated** (§9.2). |
| `MICROSOFT_CLIENT_SECRET` | Entra app client secret. Issue a new one, then delete the old from the app registration — do not merely add. |
| `STRIPE_SECRET_KEY` | Roll in the Stripe dashboard. Note the old key keeps working until explicitly revoked; revocation is a distinct step and part of acceptance (§7.9). |
| `TRUELAYER_CLIENT_SECRET` | Provider client secret, same exposure argument. |
| `ENCRYPTION_KEY` | **Owner-decided 2026-08-17** (drift-report §9.2a, manual-settings §6). Blast radius is HMRC tokens only; existing test integrations are re-authorised. See §3. |
| `PORTAL_SEED_SECRET` | Shared secret gating `seed-portal-test-users`. **Owner decision open (§9.5): rotating it is the minimum; not deploying the seed function to production is strictly better.** |

### 1.2 CARRY (14)

| Secret | Reason | Action still required |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Public client identifier, not a credential | Add the target's redirect URI to the OAuth client |
| `MICROSOFT_CLIENT_ID` | Application (client) ID | Add the target's redirect URI |
| `HMRC_CLIENT_ID` | Application identifier in the HMRC developer hub | Re-register redirect URI. **Conditional on §9.1** |
| `HMRC_AUTH_URL` | Base URL constant (`https://test-api.service.hmrc.gov.uk` is the in-code default, `_shared/hmrc-auth.ts:9`) | Set explicitly; do not rely on the default |
| `HMRC_MODE` | Mode flag | Confirm the intended value for London |
| `HMRC_CT_GATEWAY_ID` | Government Gateway identity, belongs to the practice | none |
| `STRIPE_PRICE_SOLO` | Account-level price ID | none, provided the same Stripe account |
| `STRIPE_PRICE_SCALE` | as above | as above |
| `STRIPE_PRICE_TEAM` | as above | as above |
| `TRUELAYER_CLIENT_ID` | Client identifier | none |
| `TRUELAYER_ENV` | Environment selector (`sandbox`/`live`) | Confirm intended value |
| `TRUELAYER_PROVIDERS` | Provider allow-list config | none |
| `TL_SCHED_BATCH_SIZE` | Tuning value, not a credential | none |
| `TL_SCHED_MAX_CONCURRENCY` | Tuning value, not a credential | none |

### 1.3 RETIRE (7)

| Secret | Reason |
|---|---|
| `COMPANIES_HOUSE_API_KEY` | Read by no function (verified: absent from the 36 `Deno.env.get` names). Manifest-only ghost; code reads `CH_PROD_API_KEY`/`CH_TEST_API_KEY`. |
| `GMAIL_CLIENT_ID` | Read by no function. Superseded by `GOOGLE_CLIENT_ID`. |
| `GMAIL_CLIENT_SECRET` | Read by no function. Superseded by `GOOGLE_CLIENT_SECRET`. |
| `OUTLOOK_CLIENT_ID` | Read by no function. Superseded by `MICROSOFT_CLIENT_ID`. |
| `OUTLOOK_CLIENT_SECRET` | Read by no function. Superseded by `MICROSOFT_CLIENT_SECRET`. |
| `LOVABLE_API_KEY` | Lovable Email API dies with the migration (manual-settings §4). |
| `LOVABLE_SEND_URL` | as above. |

Setting a RETIRE name on the target is itself a defect: it re-creates the condition where the
manifest certifies a secret nothing consumes. The CI check in §5 must fail on it.

### 1.4 NEW-VALUE-REQUIRED (14)

| Secret | Why no old value can serve |
|---|---|
| `SUPABASE_URL` | Bound to the project ref. |
| `SUPABASE_ANON_KEY` | Signed by the project's JWT secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | as above. |
| `VITE_SUPABASE_URL` | as above. |
| `VITE_SUPABASE_PROJECT_ID` | The ref itself. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | as above. |
| `email_queue_service_role_key` (Vault) | A copy of the target's service-role key, which is itself new. **Create it under a truthful name — see below.** |
| `STRIPE_WEBHOOK_SECRET` | Per-endpoint signing secret. A new endpoint against the target's function URL generates a new one; there is nothing to rotate (manual-settings §3). |
| `TRUELAYER_REDIRECT_URI` | The target's callback URL. Project-bound. |
| `ALLOWED_ORIGINS` | Must be the real domain. Carrying the value forward carries the `*.lovable.app` / `*.lovableproject.com` open-origin trust recorded in drift-report §7. |
| `APP_URL` | Target-bound. |
| `APP_PUBLIC_URL` | Target-bound. |
| `PORTAL_PUBLIC_URL` | Target-bound. |
| `CRON_SECRET` | Does not exist in the source Vault (manual-settings §5, `vault_secret_exists` = false), and its Edge-env state is **[UNVERIFIED]**. Generate once; write to **both** stores (§4.3). |

The six Supabase-generated values are necessarily new on a new project and **none may be
copied** — this is not a policy choice, it is arithmetic: they are signed by a JWT secret that
does not exist yet.

**Rename at creation.** `email_queue_service_role_key` is misleading (finding 5) and the standing
objection to renaming it — "not migration-safe" (manual-settings §5) — **evaporates on a
greenfield project**: nothing on the target reads the old name yet. Create it as
`cron_service_role_key`, update `infra/supabase-manifest.json` `requiredVaultSecrets`, and
author the target's cron migrations against the new name from the first one. Doing it later is
strictly harder. Owner sign-off in §9.6.

### 1.5 Names that must be *added*, and are not among the 45

The replacement email provider (manual-settings §4) introduces at minimum an API key and a
verified sending identity — two or more new names. They do not exist yet because the provider
has not been chosen (§9.9). They must land in `requiredSecrets` at the same commit that
introduces the code reading them, which is exactly what the §5 CI check enforces.

`VITE_APP_URL` (`src/lib/app-config.ts:26`) is a pre-existing 46th name; fold it into the
reconciliation.

---

## 2. Plaintext provider tokens

**The greenfield property is the whole opportunity.** No token rows are being restored (the
Lovable export excludes secrets, and the "all data is test data" premise governs the rest —
drift-report §9.7). So there is **no decryption problem, no backfill, no dual-read window**. The
target starts with zero rows in `connected_mailboxes.access_token`, `.refresh_token` and
`bank_connections.access_token`, `.refresh_token`. Whatever scheme is chosen, the first token
ever written is written under it. That is the cheapest this decision will ever be.

Today those columns hold raw provider credentials protected by RLS alone (drift-report §5.3).
The practical meaning: anything that can read a `connected_mailboxes` row can read and replay a
live mailbox token, and anything that can read a `bank_connections` row can read a live bank
access token. Every SECURITY DEFINER function that touches those tables — and 345 of 370 live
functions are SECURITY DEFINER — is a potential exfiltration path that RLS does not see.

### Option A — Encrypt at rest with a KDF-derived key held in Edge Function env

Extend the existing HMRC pattern to all four providers via one shared helper
(`_shared/token-crypto.ts`), replacing the three duplicated AES-GCM implementations.

- **Separation of concerns is real.** The key lives in the Edge Function environment, the
  ciphertext lives in Postgres. A database compromise alone — a leaked service-role key, an
  over-broad SECURITY DEFINER function, a restored backup landing in the wrong place — yields
  ciphertext, not tokens. That is precisely the class of exposure §5.3 describes.
- **One implementation, four providers.** Consistency with HMRC rather than a second scheme.
- **Cost:** eleven functions change (§0.1). Every read path gains a decrypt, every write path an
  encrypt. Miss one and the column silently becomes mixed plaintext/ciphertext — a failure mode
  worth designing against explicitly (see the version prefix below).
- **Cost:** key rotation later requires re-encrypt or forced re-authorisation. Mitigated, not
  removed, by versioned envelopes.

### Option B — Database-side encryption (Vault / pgsodium-backed columns)

- **Key never leaves the database**, so no Edge Function ever handles key material.
- **But the keys are co-located with the ciphertext.** A compromise that reaches the database as
  a privileged role reaches both. This inverts Option A's main benefit and, given the exposure
  §5.3 actually describes is *database-side over-reach*, it defends against the wrong thing.
- **Vendor risk.** pgsodium and Transparent Column Encryption have been deprecated on Supabase in
  favour of Vault for secret storage. **[UNVERIFIED — confirm against current Supabase
  documentation at build time before this option is chosen.]** Building on a deprecated
  extension for a launch platform is a poor trade.
- **Cost:** Edge Functions would need a SECURITY DEFINER RPC to fetch a decrypted token, which
  re-creates the exfiltration path in a new shape.

### Option C — Accept plaintext, add compensating controls

- Revoke `SELECT` on the token columns from `anon` and `authenticated` (column-level grants), so
  the columns are reachable only by `service_role`.
- Route all access through narrowly scoped SECURITY DEFINER functions that return a *usable
  result* (a sync outcome), never the token.
- Log every access; alert on volume.
- **Cheapest by far — zero function changes.** And it is a genuine improvement over today.
- **But it does not survive the threat it is meant to address.** A restored dump, a leaked
  service-role key, or one over-broad definer function still yields live bank and mailbox
  credentials. For a platform holding client bank connections that is not a defensible resting
  place at launch.

### Recommendation

**Option A, with Option C's column grants as defence in depth.** They are complementary, not
alternatives: encrypt the values *and* stop `authenticated` reading the columns at all.

Two design requirements that today's HMRC scheme lacks and that must not be repeated:

1. **Versioned envelope.** Store `v1:<base64(iv||ciphertext)>`, not bare base64. This makes a
   half-migrated column *detectable* rather than silent, and makes a future key rotation a
   decrypt-old / encrypt-new operation instead of a forced re-authorisation of every client.
   Today's HMRC ciphertext has no version tag, which is the direct reason "rotate `ENCRYPTION_KEY`"
   currently means "everyone re-authorises".
2. **Per-purpose key derivation.** Derive a distinct AES-GCM key per provider from the same root
   key material using HKDF with an `info` label (`aos/token/v1/gmail`, `…/outlook`, `…/truelayer`,
   `…/hmrc`). One compromised derived key does not become four.

Illustrative shape only — not a file to create now:

```ts
// supabase/functions/_shared/token-crypto.ts  (ILLUSTRATIVE)
const raw = Deno.env.get("ENCRYPTION_KEY");
if (!raw) throw new Error("ENCRYPTION_KEY is not set — refusing to start");   // fail closed

async function keyFor(purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw", base64ToBytes(raw), "HKDF", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(purpose) },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function sealToken(purpose: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await keyFor(purpose), new TextEncoder().encode(plaintext),
  );
  return `v1:${bytesToBase64(concat(iv, new Uint8Array(ct)))}`;
}

export async function openToken(purpose: string, sealed: string): Promise<string> {
  const [v, payload] = splitOnce(sealed, ":");
  if (v !== "v1") throw new Error(`unsupported token envelope version: ${v}`);
  // …
}
```

`openToken` throwing on an unrecognised prefix is the point: a plaintext value that slipped
through raises immediately instead of being replayed to a provider.

---

## 3. `ENCRYPTION_KEY` hardening

Three defects, all confirmed at the eight cited lines.

### 3.1 The published-constant fallback must go

`hmrc-callback/index.ts:13`, `hmrc-vat-obligations/index.ts:16` and `_shared/hmrc-auth.ts:12` all
read:

```ts
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production';
```

With the variable unset, HMRC tokens are encrypted with a constant that is in this repository and
therefore in every clone of it. Whether the source project actually sets the variable is
**[UNVERIFIED]** — Edge Function environment is not readable from the evidence pack. That
uncertainty is itself the argument: a design where "is it set?" is unanswerable and the wrong
answer is silent is the defect, independent of which state it is currently in.

Replace with a module-load throw. Failing closed is the correct behaviour: an HMRC function that
cannot start is a visible outage; one that starts with a known key is an invisible breach.

### 3.2 `padEnd(32,'0').slice(0,32)` must be replaced with a real KDF

At `hmrc-vat-obligations/index.ts:29,51`, `_shared/hmrc-auth.ts:31,59`,
`hmrc-callback/index.ts:24`, the key is used as:

```ts
encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32))
```

This has three consequences: a short key is zero-padded to full length with no warning, so a
5-character key yields a 32-byte key with 27 known bytes; a long key is truncated to its first 32
characters, so the entropy beyond byte 32 is discarded; and the key is used as raw AES material
with no domain separation. Replace with the HKDF derivation in §2, plus an explicit length
validation on the supplied key material — reject anything under 32 bytes rather than padding it.

### 3.3 Consolidate the three duplicate implementations

`encryptValue`/`decryptValue` are defined independently in `_shared/hmrc-auth.ts:22–77` and again
locally in `hmrc-callback/index.ts` and `hmrc-vat-obligations/index.ts`. Three copies of one
crypto routine is three places a fix can be missed. Collapse into the single
`_shared/token-crypto.ts` of §2 and have all HMRC call sites import it. This is also what makes
Option A's eleven-function change tractable: after consolidation there is one implementation and
eleven call sites, not eleven implementations.

### 3.4 Migration path

**ROTATE is already decided** (drift-report §9.2a). That decision does the hard part: because a
new key is generated for London and existing HMRC test integrations are re-authorised, there is
**no old-ciphertext-under-old-key problem** and no dual-read window is needed. The sequence
reduces to:

1. Generate a fresh 32-byte key, base64-encoded, from a CSPRNG.
2. Set `ENCRYPTION_KEY` on the target **before** any HMRC function is deployed (§6, ordering
   constraint O4). With the fallback removed, deploying first produces a hard failure, which is
   intended but avoidable.
3. Deploy the hardened functions. HMRC re-authorisation happens naturally on first use.
4. The version prefix means the *next* rotation, whenever it comes, is a background re-encrypt
   rather than a re-authorisation of every client. That is the durable win and the reason to fix
   the envelope now rather than after launch.

---

## 4. Cron credential handling

### 4.1 The rule

**No credential value ever appears in `cron.job.command`.** `cron.job` is a catalog table; a
literal there is plaintext at rest, readable by anything that can read the catalog, and invisible
to secret scanning. Every job on the target reads its bearer at run time from
`vault.decrypted_secrets`.

The pattern is already in the repository and is the one to reuse verbatim —
`supabase/migrations/20260817100000_def_003_reinstate_email_queue_drain.sql` §2:

```sql
SELECT cron.schedule(
  '<job-name>', '<schedule>',
  $cron$
  SELECT net.http_post(
    url := 'https://<TARGET_REF>.supabase.co/functions/v1/<function>',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
```

Two points the five defective legacy jobs get wrong at once. First, the literal is a **plaintext
credential in a catalog table**. Second, it is an **anon** JWT, which for any function requiring
authorisation cannot succeed — that is consistent with drift-report §5.2's finding that the two
chaser jobs 401 on every run, though the report is explicit that its attribution is by count and
cadence rather than a per-job join, so treat the causal link as strong inference, not proof.

### 4.2 A structural guard, not a convention

Conventions decay; this one already did — five of thirteen jobs drifted off it. Add a database
function and assert it in every cron migration and in the smoke test:

```sql
-- ILLUSTRATIVE
CREATE OR REPLACE FUNCTION public.assert_no_literal_credentials_in_cron()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_bad text[];
BEGIN
  SELECT array_agg(jobname) INTO v_bad
  FROM cron.job
  WHERE command ~ 'eyJ[A-Za-z0-9_-]{20,}'      -- a JWT literal
     OR command ~* 'Bearer\s+[A-Za-z0-9._-]{20,}'  -- any literal bearer not built by concatenation
     OR command LIKE '%app.settings.%';        -- the DEF-018 GUC pattern
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'cron jobs carry literal credentials or the DEF-018 pattern: %', v_bad;
  END IF;
END $$;
```

Every cron migration on the target calls this in its post-assertion block, alongside the
assertions DEF-003 already demonstrates. A job that reintroduces a literal cannot commit.

### 4.3 `CRON_SECRET` — the two-store confusion is the root cause of finding 4

This is worth stating plainly because it is the actual bug:

| Store | Read by | How |
|---|---|---|
| **Supabase Vault** (`vault.decrypted_secrets`) | the pg_cron job, when building its `x-cron-secret` header | SQL, inside `cron.job.command` |
| **Edge Function environment** | `truelayer-sync-scheduled` | `Deno.env.get("CRON_SECRET")` at `index.ts:13`, compared at `:178` |

These are **different stores with no synchronisation**. Setting an Edge Function secret does not
create a Vault entry, and creating a Vault entry does not populate Edge Function env. Someone set
one side and reasonably assumed the other followed. It did not: `vault_secret_exists('CRON_SECRET')`
returns false while the function's env state is **[UNVERIFIED]**, and the job consequently sends a
null header that `index.ts:178` rejects.

**Target provisioning, in order:**

1. Generate one high-entropy value from a CSPRNG.
2. Set it as an **Edge Function secret** named `CRON_SECRET`.
3. Create it as a **Vault secret** named `CRON_SECRET`.
4. Only then schedule any job that sends the header.

Step 4 is enforced, not documented: the scheduling migration carries a precondition identical in
shape to DEF-003's guard at lines 60–90 — refuse to schedule if the Vault entry is missing or
empty, with the same reasoning stated there, that *a job which runs on schedule and 401s on
schedule manufactures the appearance of working infrastructure*. That guard is the single most
valuable thing to copy forward from the legacy migration set.

The Edge-env half cannot be asserted from SQL. It is covered behaviourally instead (§7.3).

### 4.4 Two mechanisms for one function must be resolved before scheduling

`truelayer-sync-hourly` (`7 * * * *`) sends `x-cron-secret`; `truelayer-sync-scheduled`
(`*/30 * * * *`) sends no such header at all, and both call the same function, and both currently
401 (drift-report §5.2). On the target: **one function, one authentication mechanism.** Whether
that means one job or two is drift-report §9.5, restated here as §9.7 — but it must be settled
*before* either is scheduled, not after.

### 4.5 Which credential, and least privilege

All thirteen jobs currently authenticate as either anon (broken) or the general service-role key
under an email-specific name. Service-role is a full RLS bypass handed to thirteen scheduled
processes. **Recorded as a known compromise, not solved here** — the correct answer is
per-function scoped credentials, which Supabase Edge Functions do not natively provide. The
`CRON_SECRET` shared-header pattern is a partial mitigation and should be extended to *every*
scheduled function on the target, so a leaked service-role key alone is insufficient to invoke a
cron endpoint. Out of scope for the migration itself; captured in §8 as follow-up.

---

## 5. Secret-name hygiene

### 5.1 The current state is worse than "incomplete"

`infra/supabase-manifest.json` declares 16 `requiredSecrets`. Five of them are read by no
function. Twenty-five names that code actually reads are absent. So a completeness check over the
manifest **passes while certifying five secrets that do nothing and ignoring twenty-five that are
load-bearing**. A check that returns green on a system in this state is worse than no check: it
converts an unknown into a false assurance.

### 5.2 Reconcile

At target-build time, regenerate `requiredSecrets` from what code reads:

- Remove the 5 RETIRE names (§1.3 — `COMPANIES_HOUSE_API_KEY`, `GMAIL_CLIENT_ID`,
  `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, plus `LOVABLE_API_KEY`
  which is also currently declared).
- Add the 25 undeclared names.
- Add the email-provider names once the provider is chosen (§1.5).
- Set `requiredVaultSecrets` to `["cron_service_role_key", "CRON_SECRET"]` (§1.4 rename, §4.3).
- Fold in `VITE_APP_URL` and the three `VITE_SUPABASE_*` names, or introduce a separate
  `requiredBuildVars` list — they are build-time frontend variables, not Edge Function secrets,
  and conflating them makes the check less precise. **Prefer the separate list.**
- Remove the duplicated `handle-email-unsubscribe` entry (drift-report §6).

### 5.3 The CI check

**It must live in the vitest suite, not in `scripts/smoke-test.ts`.** `.github/workflows/ci.yml`
runs the `test` job on every push and PR, but gates `smoke` behind
`if: github.event_name == 'workflow_dispatch'` because it needs live credentials. A secret-name
drift check needs no credentials — it is pure static analysis of the repository — so putting it
in `scripts/smoke-test.ts` would mean it effectively never runs. Put it at
`src/test/regression/manifest-secret-drift.test.ts`, where `bun run test` gates it on every PR.

Three assertions:

```ts
// ILLUSTRATIVE — src/test/regression/manifest-secret-drift.test.ts
// 1. Set equality: every Deno.env.get() name in supabase/functions is declared,
//    and every declared name is read somewhere.
const readInCode  = scanDenoEnvGets("supabase/functions");           // 36 today
const declared    = new Set(manifest.requiredSecrets);               // 16 today
expect([...readInCode].filter(n => !declared.has(n))).toEqual([]);   // 25 today -> must be 0
expect([...declared].filter(n => !readInCode.has(n))).toEqual([]);   //  5 today -> must be 0

// 2. Fail-closed: no secret in the must-fail-closed list may have an `|| 'literal'` fallback.
for (const name of MUST_FAIL_CLOSED) {              // ENCRYPTION_KEY, CRON_SECRET, *_SECRET, *_KEY
  expect(sourceOf(name)).not.toMatch(
    new RegExp(`Deno\\.env\\.get\\(['"]${name}['"]\\)\\s*\\|\\|\\s*['"\`]`),
  );
}

// 3. No literal credential or legacy project ref anywhere in shipped source.
//    Excludes docs/migration/lovable-source/** and supabase/migrations/** (retained history).
expect(scanForJwtLiterals(["src", "supabase/functions", "vite.config.ts", "infra"])).toEqual([]);
expect(scanForLegacyProjectRef([...])).toEqual([]);
```

Assertion 3 catches `vite.config.ts:8` today and would have caught it the day it was written.
Assertion 2 catches the `ENCRYPTION_KEY` fallback and prevents its return. Assertion 1 is the
manifest reconciliation and, once green, stays green only if every new secret is declared in the
commit that introduces it.

An explicit `optionalSecrets` escape hatch is needed for genuinely optional tuning values
(`TL_SCHED_BATCH_SIZE`, `TL_SCHED_MAX_CONCURRENCY`) — but it must be an explicit list in the
manifest, reviewed like any other declaration, never a silent skip.

---

## 6. Sequencing and ordering constraints

Stages. Each completes before the next begins.

| Stage | Work |
|---|---|
| **S0** | Repository hardening — done entirely on git, before the target exists. §3 (fail-closed + KDF + consolidation), §2 Option A helper and eleven call sites, §5.3 CI check, `vite.config.ts` legacy ref/anon-key removal. All of it is testable without the target. |
| **S1** | Target project created (London). Its six Supabase-generated values now exist and can be captured. |
| **S2** | External re-registrations: Google, Microsoft, TrueLayer, HMRC, Companies House, Stripe. Produces the ROTATE values and the redirect URIs. |
| **S3** | Edge Function secrets set — all 38 that survive (45 − 7 RETIRE), including `ENCRYPTION_KEY` and `CRON_SECRET`. |
| **S4** | Vault secrets created: `cron_service_role_key`, `CRON_SECRET`. |
| **S5** | Extensions enabled (`pg_cron`, `pg_net`), then the reviewed canonical schema baseline applied (drift-report §8). |
| **S6** | Edge Functions deployed. |
| **S7** | Endpoint-derived values registered and set: `STRIPE_WEBHOOK_SECRET`, `TRUELAYER_REDIRECT_URI` — these need the function URLs from S6. |
| **S8** | Cron jobs scheduled, each with vault-read credentials and post-assertions. |
| **S9** | Verification (§7). |

### Hard ordering constraints

- **O1 — Vault before cron.** `cron_service_role_key` and `CRON_SECRET` must exist before any job
  reading them is scheduled. Enforced in the migration, not by discipline; DEF-003
  (`20260817100000_…sql` lines 60–90) is the template. This is manual-settings §5's standing
  instruction and the single most important ordering rule here.
- **O2 — Extensions before cron migrations.** `pg_cron` and `pg_net` must be enabled or
  `net.http_post` does not exist. DEF-003 already asserts both.
- **O3 — Functions deployed before endpoint-bound secrets.** Stripe's signing secret and
  TrueLayer's redirect URI are consequences of URLs that S6 creates. They are structurally last;
  a plan that schedules them early will stall.
- **O4 — `ENCRYPTION_KEY` before HMRC functions deploy.** With the fallback removed the functions
  refuse to start without it. Intended, and avoidable by ordering.
- **O5 — `vite.config.ts` fixed before any frontend build.** Lines 7–8 are the *fallbacks* used
  when `process.env.VITE_SUPABASE_*` is unset at build time, so a build in an environment missing
  those variables compiles the legacy ref and legacy anon key into the shipped bundle. Fix in S0,
  before a single build runs.
- **O6 — Email provider live before any Auth user needs a password reset.** From manual-settings
  §10: passwords do not export, so every user must reset, and the reset mail runs through the
  provider. Moot if the "all data is test data" premise holds (§9 of drift-report, decision 7) —
  but that premise must be *confirmed*, not assumed.
- **O7 — Do not create role `sandbox_exec`.** The four `ALTER ROLE sandbox_exec … NOBYPASSRLS`
  migrations must not be carried into the baseline. The role is a Lovable platform artefact and
  DEF-031 exists because platform automation kept restoring `BYPASSRLS` on it. Its live BYPASSRLS
  state is **[UNVERIFIED]** (drift-report §3.3 says so); the recommendation does not depend on
  resolving that.
- **O8 — Retire before deploy.** The 7 RETIRE names must never be set on the target. Setting them
  "just in case" recreates the exact condition §5.1 describes.

---

## 7. Verification and acceptance criteria

Behavioural proof throughout. "The secret is set" proves nothing — the legacy estate has thirteen
cron jobs that pg_cron reports as succeeding while four of them 401 on every run. Configuration
inspection is what allowed that.

| # | Item | Proof |
|---|---|---|
| 7.1 | No literal credential in any cron command | `SELECT public.assert_no_literal_credentials_in_cron();` returns without raising, run as a post-assert inside every cron migration **and** independently after S8. Structural, and cheap enough to run continuously. |
| 7.2 | Every cron job actually authenticates | For each of the 13: an observed **2xx** response attributable to that job within one cadence window. A green `cron.job_run_details` row is explicitly **not** acceptance — that is the exact signal that concealed the legacy failure for months. Where per-job attribution is unavailable, invoke the function directly with the job's own credential construction and assert 2xx. |
| 7.3 | `CRON_SECRET` present in **both** stores | Three-outcome behavioural test against the deployed function: no `x-cron-secret` header → **401**; wrong value → **401**; correct value → **2xx**. The 2xx proves the Edge-env half; the vault half is proven by 7.2 for the job that builds the header. A presence check alone would have passed on the legacy project's Edge side while the Vault side was empty. |
| 7.4 | `ENCRYPTION_KEY` fails closed | With the variable unset (scratch/branch project, never the target), an HMRC function fails to start / returns 5xx. With it set, a full HMRC authorise round-trip completes. Both halves required — the negative case is the one that matters. |
| 7.5 | No published-constant fallback survives | CI assertion 2 (§5.3) red on a deliberately reintroduced fallback in a scratch branch; green on `main`. |
| 7.6 | Provider tokens encrypted at rest | After a real Gmail, Outlook and TrueLayer authorise: a service-role `SELECT access_token, refresh_token` returns values beginning `v1:` and matching no provider token shape. **Then** a sync run for each provider succeeds, proving the decrypt path. Encryption without a working decrypt is a broken integration wearing a green tick. |
| 7.7 | Token columns unreachable by application roles | As an authenticated user of org A, selecting the token columns errors or returns null. Verified with a **real authenticated user**, never through a role that could bypass RLS (manual-settings §11.2). |
| 7.8 | Manifest/code parity | CI test green on `main`; red when a `Deno.env.get('NEW_NAME')` is added without a manifest entry — proven by a deliberate scratch-branch edit, not by assuming the test works. |
| 7.9 | Legacy credentials invalidated | For each ROTATE secret, the **old** value is confirmed rejected by its issuer. Issuing a new Stripe key does not revoke the old one; adding an Entra secret does not remove the previous. Rotation without revocation is not rotation. |
| 7.10 | No legacy ref or anon key shipped | `git grep` for the legacy project ref and for `eyJ` returns hits only in `docs/migration/lovable-source/**` and retained `supabase/migrations/**` history. The **built** `dist/` bundle contains neither. |
| 7.11 | No bypass role | No role with `rolbypassrls` **and** `rolcanlogin`; `sandbox_exec` does not exist on the target (manual-settings §11.5). |
| 7.12 | RETIRE names absent | The target's Edge Function secret list contains none of the 7. |

---

## 8. Explicitly out of scope

- **Repairing the legacy backend.** The four 401ing cron jobs, the missing Vault `CRON_SECRET`
  and the five literal-JWT jobs stay as they are on `moxpdejnucjjcplleefn`. They are fixed by
  being rebuilt correctly on the target.
- **The storage bucket set** (drift-report §3.2 / §9.3) — unresolved, and not a credential
  question.
- **Choosing the email provider** (§9.4 of drift-report). This plan records where its secrets go,
  not which provider it is.
- **HMRC production recognition** — an external gate, unstarted, unaffected by this work.
- **The schema baseline itself** (drift-report §8) — a separate decision, already taken, separately
  planned.
- **Auth configuration capture** (manual-settings §1) and **project-level settings** (§8) —
  Dashboard work, not credential handling.
- **The 688 RLS policies** — reviewed separately. §2's column grants are additive to them, not a
  substitute.
- **Per-function scoped cron credentials** (§4.5). The right answer, not available from the
  platform today. Recorded as post-launch.
- **Rotating credentials on a schedule.** This plan establishes the ability (versioned envelopes,
  §2) but does not set a rotation cadence.
- **Data migration and Auth user handling** — drift-report §9.7.

---

## 9. Owner decisions still required

1. **HMRC application** — reuse the existing developer-hub application (so `HMRC_CLIENT_ID` is
   CARRY and only the secret rotates), or register a new one for London (making both
   NEW-VALUE-REQUIRED)? Affects two rows of §1.
2. **Government Gateway password** — `HMRC_CT_GATEWAY_PASSWORD` rotation happens at the Gateway
   and may affect other consumers of that credential. Confirm before rotating, and coordinate.
3. **Supabase API key format** — new projects may offer publishable/secret API keys in place of
   the legacy anon/service_role JWTs. Prefer them if available. **[UNVERIFIED — confirm against
   the target project's API settings.]** Affects six §1.4 rows and the shape of the cron bearer.
4. **Plaintext provider tokens** — Option A (recommended), B, or C? This is the single largest
   engineering decision in this plan (eleven functions, §0.1) and it must be taken **before** S0,
   because it is repository work that precedes the target existing.
5. **`PORTAL_SEED_SECRET`** — rotate, or retire the seeding functions from the production target
   entirely? Retiring is the stronger position; `seed-portal-test-users` and `portal-qa-probe`
   deploy with the platform default `verify_jwt` today because they appear in the manifest but not
   `config.toml` (drift-report §6).
6. **Rename `email_queue_service_role_key` → `cron_service_role_key`** — recommended, and only
   free while the target is greenfield. Confirm.
7. **TrueLayer job pair** — one job or two, and one authentication mechanism (drift-report §9.5).
   Must be settled before S8.
8. **`CH_TEST_API_KEY`** — ROTATE (as listed) or CARRY? Depends on whether the sandbox key carries
   an origin restriction.
9. **Email provider** — blocks the two-plus new secret names of §1.5 and ordering constraint O6.

---

## 10. Self-review

- **Coverage against the brief:** rotation matrix for all 45 with categories summing to 45 (§1);
  plaintext-token options with trade-offs and the greenfield note (§2); `ENCRYPTION_KEY`
  fail-closed + KDF + migration path (§3); cron credentials and the two-store `CRON_SECRET`
  explanation (§4); manifest reconciliation and a CI check (§5); sequencing with eight hard
  constraints (§6); twelve behavioural acceptance criteria (§7); out-of-scope (§8); nine open
  decisions (§9).
- **Where this plan corrects its inputs:** the plaintext-token finding covers **twelve write sites
  across eight functions**, not three (§0.1) — this changes Option A from a small change to a
  substantial one and is the reason §9.4 must be decided before S0. `VITE_APP_URL` is a 46th
  configuration name not previously recorded.
- **What is not proven here:** findings 1, 4, 5 and 8 rest on live readings taken on 2026-08-17
  that cannot be re-verified from the repository, and no database was contacted for this plan.
  Each is labelled at its first use. Finding 8's BYPASSRLS attribute in particular is a repo
  record from 2026-08-06, not a live read — the recommendation not to recreate the role does not
  depend on it.
- **Biggest risk to this plan:** §2 Option A touches eleven functions in one release, and a missed
  call site produces a silently mixed-format column. The `v1:` envelope prefix is the mitigation —
  it converts that failure from silent replay of a plaintext token into an immediate throw.

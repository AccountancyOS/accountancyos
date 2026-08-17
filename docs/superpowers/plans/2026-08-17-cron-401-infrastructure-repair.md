# Cron 401 infrastructure repair — Plan

> **NOTHING IN THIS DOCUMENT IS TO BE APPLIED.** This is a plan for a later, separately-approved
> increment. No migration was authored, no SQL was run, no MCP write tool was called, and no code
> was changed in producing it. Every "do X" below is a proposal awaiting the owner's go-ahead.

**Date:** 2026-08-17
**Class:** P1 infrastructure drift — silently-dead automation.
**Grounding:** `docs/migration/lovable-source/drift-report.md` §3.1, §5.1, §5.2, §9.5–§9.6;
`docs/releases/2026-08-17-def-003-reinstate-email-queue-drain.json`;
`supabase/migrations/20260817100000_def_003_reinstate_email_queue_drain.sql` (the reference
pattern for a self-verifying cron migration).

**The defect in one line:** four live cron jobs POST edge functions with credentials those
functions reject, so the chaser engine, dormant-lead scanning and bank-feed sync have not run —
and `pg_cron` reports every one of those runs as *succeeded*, because `net.http_post` is
asynchronous and the SQL completes regardless of the HTTP status
(`supabase/migrations/20260805211212_e16f60f3-dc37-4f6e-8937-7bcb2f7daa0e.sql:141-147`).

---

## 1. Evidence base

| Source | What it establishes | Class |
|---|---|---|
| `mcp_http_delivery_health(240)`, read 2026-08-17 | 844 responses, 814 2xx, 29 unauthorized, 0 server_error | [LIVE] |
| `docs/migration/lovable-source/live-inventory.json:89170-89300` | The exact command text of all 13 live cron jobs, credentials redacted but the *shape* of each header set preserved | [LIVE, redacted] |
| `supabase/functions/*/index.ts` | What each receiving function requires | [GIT HEAD] |
| `supabase/config.toml:10-17, 114-115` | Gateway `verify_jwt` for the five functions in question | [GIT HEAD] |
| `vault_secret_exists('CRON_SECRET')` → false | The Vault has no `CRON_SECRET` entry | [LIVE] |

**Standing caveat, applies throughout.** Deployed edge-function bodies cannot be read from here —
the Supabase MCP connector is bound to a different project (`vazeqolkxinsjvgzqrgj`), per
drift-report §4. All reasoning about receiving functions is over **git HEAD**. Where git HEAD and
the deployed body diverge, this analysis is wrong. That is a real risk in this repo (see the
"live vs git divergence" pattern), and it is why every repair below is gated on reproducing the
failure first (§7) rather than on this analysis being correct.

Two small precision notes on the delivery-health numbers, neither material:
- `mcp_http_delivery_health` buckets 401 **and** 403 together as `unauthorized`
  (`…20260805211212…sql:174`). The 29 are "401 or 403"; the functions below all return 401, so
  the label holds, but it is not proven by the projection alone.
- 844 − 814 − 29 = **1 response unaccounted for**. Not explained. Could be a 3xx, a timeout or a
  null-status row. Flagged, not resolved.

---

## 2. Root-cause table

One row per failing job. "Sends" is read from the live command text; "Requires" from git HEAD.

| # | Live job (schedule) | Target function | Sends | Function requires | Why it 401s | Confidence |
|---|---|---|---|---|---|---|
| 1 | `chaser-tick-every-15min` (`*/15 * * * *`, jobid 6) | `chaser-tick` | `Authorization: Bearer <literal anon JWT>` | `Authorization` bearer **string-equal to `SUPABASE_SERVICE_ROLE_KEY`** — `chaser-tick/index.ts:26-29` | anon JWT ≠ service-role key → `401 {"error":"Unauthorized"}`. Not a gateway rejection: `config.toml:10-11` sets `verify_jwt = false`, so the request reaches the function and the function refuses it. | **Verified from repo + live command shape.** Deployed body unread. |
| 2 | `chaser-trigger-scan-every-6h` (`0 */6 * * *`, jobid 7) | `chaser-trigger-scan` | same shape as #1 | same gate — `chaser-trigger-scan/index.ts:38-40` | identical to #1; `config.toml:12-13` `verify_jwt = false` | **Verified**, same basis |
| 3 | `truelayer-sync-hourly` (`7 * * * *`, jobid 15) | `truelayer-sync-scheduled` | `apikey: <literal anon JWT>` + `x-cron-secret: (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET')`. **No `Authorization` header.** | `x-cron-secret` header string-equal to `Deno.env.get("CRON_SECRET")` — `truelayer-sync-scheduled/index.ts:173-180`, the first statement in the handler | the Vault has no `CRON_SECRET` (`vault_secret_exists` → false [LIVE]), so the subquery yields SQL NULL and the header is sent empty/absent → mismatch → 401 | **Verified** (the Vault absence is a live reading) |
| 4 | `truelayer-sync-scheduled` (`*/30 * * * *`, jobid 19) | `truelayer-sync-scheduled` | `Authorization: Bearer <vault email_queue_service_role_key>`. **No `x-cron-secret` at all.** | same gate as #3 | the required header is never sent → `null !== CRON_SECRET` → 401. The bearer it does send is not read by this function. | **Verified** |

**Attribution of the 29 to these four is inference, and remains so.** The projection does not join
responses to job names, and `cron.job_run_details` / `net._http_response` are not directly
reachable. The count matches exactly (16 + 8 + 4 + 1 = 29) and the cadences are unique — 401
timestamps land on `:00`, `:07`, `:15`, `:45`, and `:07` belongs to nothing but
`truelayer-sync-hourly`. Strong, but arithmetic, not a join.

### 2a. Two more jobs, same mechanism, outside the sampled window

| Live job (schedule) | Target function | Sends | Requires | Status |
|---|---|---|---|---|
| `dormant-lead-scan-daily` (`0 2 * * *`, jobid 10) | `dormant-lead-scan` | `Content-Type` + `apikey: <literal anon JWT>`. **No `Authorization` header.** | `Authorization` bearer string-equal to `SUPABASE_SERVICE_ROLE_KEY` — `dormant-lead-scan/index.ts:21-26` | **Deterministic 401 by construction** (see below) |
| `invoice-overdue-scan-daily` (`0 6 * * *`, jobid 11) | `invoice-overdue-scan` | same shape | same gate — `invoice-overdue-scan/index.ts:19-24` | **Deterministic 401 by construction** |

These two were recorded as UNVERIFIED in drift-report §5.2 because `net._http_response` retention
truncates well short of 24 h (a 1440-minute query returned 1,171 rows against 844 in the preceding
four hours), so neither 02:00Z nor 06:00Z could be sampled.

**That status can be tightened without any new live read.** Their command text sends *no*
`Authorization` header at all. `req.headers.get("Authorization") || ""` therefore evaluates to the
empty string, which is compared for equality against `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`.
An empty string can only match if the env var is unset or empty — and if it were, the very next
line (`dormant-lead-scan/index.ts:31`) would crash on the non-null assertion. So on git HEAD these
two jobs cannot succeed under any configuration in which the function is otherwise operable.

This is **not** a substitute for observing it. It raises them from "unverified" to "predicted 401
with a stated mechanism", and §9 sets out how to actually observe it.

---

## 3. The finding that changes the shape of the repair

The chaser jobs do **not** 401 at the gateway. `config.toml:10-13` sets `verify_jwt = false` for
both `chaser-tick` and `chaser-trigger-scan`, precisely so pg_cron can call them without a user
JWT. The 401 is generated *inside* each function, by an authorisation gate the repo added
deliberately:

```
// FUN-2/Fix: cron-only worker (verify_jwt=false). Require the service-role key so it is not
// anonymously invokable. The pg_cron job sends it as the bearer.
const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
if (bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) { … 401 … }
```
— `supabase/functions/chaser-tick/index.ts:24-29`

So the two halves of the system disagree about the contract, and **git contains the correct
half**. `supabase/migrations/20260706211705_fbd5613f-2940-436f-8be6-a2d8dc6ba913.sql:34-63`
schedules the chasers with `'Bearer ' || current_setting('app.settings.service_role_key')` — the
right *credential*, delivered by the wrong *mechanism* (the DEF-018 GUC pattern, which is itself
broken and must never be re-applied). The live jobs were then created out of band under different
names with a literal anon JWT, and nothing reconciled the two.

Consequence: **the fix is a credential swap, not a gate change.** The jobs must send the
service-role key. Nothing about the functions needs to change, and the functions' gates should not
be weakened — they are the only thing standing between a `verify_jwt = false` endpoint and the
open internet.

A useful corollary: the Vault secret `email_queue_service_role_key` is demonstrably a JWT whose
`role` claim is `service_role`, because `process-email-queue` parses that claim and rejects
anything else (`process-email-queue/index.ts:141-149`) and the DEF-003 Gate 6 evidence shows a
queued row transitioning to `sent` on the first scheduled run. So a credential of the right *class*
is already in the Vault and already proven to work end-to-end. Whether its literal string equals
the `SUPABASE_SERVICE_ROLE_KEY` env var seen by the chaser functions is **not** proven — a string
comparison is stricter than a claim check, and a project holding both a legacy JWT key and a newer
`sb_secret_*` key would fail it. §7 handles this by proving it behaviourally before relying on it.

---

## 4. Activation blast radius — settle this BEFORE any repair

> **Measurement added 2026-08-17 (read-only).** `BATCH_SIZE = 100` is confirmed at
> `supabase/functions/chaser-tick/index.ts:38`. A live read of `automation_chaser_runs` filtered
> to `status = 'ACTIVE'` returned **zero rows**, so on this evidence the chaser backlog may be
> empty and repairing the 401 may send nothing at all.
>
> **Do not treat that as clearance.** The read is RLS-scoped to the signed-in user and
> undercounts — exactly the trap that made me call DEF-003 "latent" this morning when the
> executor's unrestricted count showed a stranded row. The backlog must be counted from an
> unrestricted session before the repair is applied. The blast-radius question below stands
> regardless; this only means the likely answer is smaller than feared, and it must be confirmed
> rather than assumed.

This is the most important section in the plan, and it is not an auth question.

`chaser-tick` selects every `automation_chaser_runs` row with `status = 'ACTIVE'` and
`next_send_at <= now()`, limit 100, and sends each one (`chaser-tick/index.ts:41-52`). **There is
no staleness guard.** The chasers were scheduled on 2026-07-06 and have been 401ing ever since, so
every due run's `next_send_at` is weeks in the past. The first successful tick sends up to 100
client-facing chaser emails immediately, and another 100 fifteen minutes later, until the backlog
drains.

The same shape applies to the daily scans: `dormant-lead-scan` upserts `lead_activity_summary` and
emits `LEAD_DORMANT` rows into `automation_events` (`dormant-lead-scan/index.ts:62-90`), which the
automation engine consumes; `invoice-overdue-scan` is structurally identical.

**Therefore: the repair increments must not be applied until the owner has ruled on the backlog.**
Options, in the order I would present them:

1. **Quarantine, then enable** (recommended). Before scheduling, count `ACTIVE` runs with
   `next_send_at < now()`. If non-zero, advance them to a chosen future timestamp (or set them
   `PAUSED`) in the *same* migration, so the first tick sends only what is genuinely due from that
   point forward. Auditable, reversible in principle, and it makes the go-live moment a decision
   rather than an accident.
2. **Accept the burst.** Defensible only if the owner confirms the affected rows are test data.
   Given "all current data is test data" is the stated premise elsewhere (drift-report §9.7) this
   may well be the answer — but it must be *confirmed*, not assumed.
3. **Repair auth with the jobs inactive** (`cron.schedule` then `cron.alter_job(active := false)`),
   verify with a manual authenticated invocation, and activate separately. Splits credential
   correctness from behavioural activation. Costs an extra increment.

Nothing in this plan is applied until this is decided.

---

## 5. Canonical-auth decision — the TrueLayer pair

Two jobs POST the same function with two different auth shapes, and both fail. Someone built the
half-hourly job to a bearer contract the function has never implemented, and the hourly job to the
contract it does implement but with a credential that does not exist.

### Options

| | Shape | Pros | Cons |
|---|---|---|---|
| **A** | Keep **one** job (`truelayer-sync-scheduled`, `*/30`); delete `truelayer-sync-hourly`; give it `x-cron-secret` from a **Vault** secret named `CRON_SECRET` | Matches the deployed function's actual gate with no function change; one job, one cadence, no ambiguity; credential out of the command text (fixes the §5.1 plaintext finding for this job); `*/30` strictly dominates `7 * * * *` | Requires the owner to create a Vault secret whose value equals the function's `CRON_SECRET` env var — a value I must never see or write |
| **B** | Keep one job but change the **function** to accept a service-role bearer like every other worker | One auth idiom estate-wide; reuses the already-proven `email_queue_service_role_key`; no new secret | Changes a deployed edge function — a bigger blast radius than a cron reschedule, and `truelayer-sync-scheduled` is the one function here whose deployed body I cannot read |
| **C** | Keep both jobs, fix both | Preserves live state exactly | Institutionalises a duplicate. Two schedules against one function is not a design, it is an artefact |

### Recommendation: **A**, with B recorded as the follow-on convergence.

Rationale. A is the smallest change that produces a working system, and it changes only cron
state — the thing this plan is chartered to change. B is the better *end state* (one auth idiom
across all workers, one credential to rotate), but it edits an edge function whose deployed body is
unverifiable from here, so it should be a separate, separately-verified increment once the estate
is stable. C should be rejected outright: `7 * * * *` adds nothing over `*/30 * * * *`.

**One decision A forces:** the secret's home. `x-cron-secret` is checked against
`Deno.env.get("CRON_SECRET")` — the **Edge Function env var** — while the cron job can only read
the **Vault**. These are two different stores and today only the function-side one is populated.
There is decent evidence it *is* populated: the function returns **503** when `CRON_SECRET` is
unset (`truelayer-sync-scheduled/index.ts:174-177`), delivery health counts 5xx separately
(`…20260805211212…sql:176`), and `server_error` was **0** across 844 responses. So the observed
failures are the 401 branch, not the 503 branch, which means the env var exists. *Inference*, over
a four-hour window, but a clean one. The owner therefore needs to mirror the existing env value
into a Vault secret named `CRON_SECRET` — not invent a new one, or the halves disagree again.

---

## 6. Canonical-auth decision — the chasers, and the naming question

**Auth.** No real optionality here, per §3: swap the literal anon JWT for a run-time Vault lookup
of the service-role key, matching the eight jobs that already work
(`live-inventory.json` `credential_source` fields). This simultaneously closes drift-report §5.1
for these jobs — the plaintext JWT sitting in `cron.job.command` disappears. Recommendation:
reuse `email_queue_service_role_key` rather than introducing a second name; it is already in
`infra/supabase-manifest.json` `requiredVaultSecrets`, already smoke-tested
(`scripts/smoke-test.ts:413-425`), and already proven to carry a `service_role` credential.

Owner may reasonably prefer a distinct name (`cron_service_role_key`) so email and automation can
be rotated independently. That is a legitimate call; it costs one more Vault secret and one more
manifest entry. I do not recommend it now — a second name that must be kept in lockstep with the
first is a new drift surface, and drift is the problem we are solving.

**Names.** Live runs `chaser-tick-every-15min` / `chaser-trigger-scan-every-6h`; git schedules
`chaser-tick` / `chaser-trigger-scan`. `cron.schedule` upserts on **job name**, so this is not
cosmetic: authoring migrations under the git names would leave the live jobs in place *alongside*
the new ones, and both would fire — doubling chaser sends.

**Recommendation: adopt the LIVE names as canonical.** It matches drift-report §3.1's
recommendation for the job set, it is what `infra/supabase-manifest.json` was reconciled to on
2026-08-17, and it avoids touching a schedule that is at least correctly *timed*.

**But adopting live names leaves a landmine**, and the plan must defuse it: a rebuild from
migrations would replay `20260706211705…sql` and create the git-named pair *in addition to* the
new live-named pair. The repair migration should therefore carry an exception-guarded
`cron.unschedule('chaser-tick')` / `('chaser-trigger-scan')` — a no-op on production today (only
13 jobs exist, none under those names — `live-inventory.json:89170-89300`), and a de-duplicator on
any rebuild. It should also assert as a *precondition* that those two names do not currently exist,
so that if reality has moved the migration refuses rather than silently unscheduling something
live.

---

## 7. Repair sequencing

Discipline, per this repo's increment rules and the DEF-003 model: **one additive, self-verifying
migration per increment**, preconditions that refuse to apply when the credential is missing, post-
assertions inside the same transaction, a release receipt, then stop and report. The owner applies;
I do not.

Two repo-specific constraints that shape the order:

- **The CI guard forces bookkeeping.** `src/test/regression/def-003-email-queue-drain.test.ts:110-147`
  holds a `SCHEDULED_OUTSIDE_GIT` allow-list of exactly these five job names, with a test that
  **fails if an entry is still listed once a migration schedules it**. Each increment below must
  remove its own entry in the same commit. The list must reach `[]`.
- **DEF-018 must not be reintroduced.** No `current_setting('app.settings.*')`. Use the literal
  project URL and a Vault lookup, exactly as `20260817100000_def_003…sql:107-123` does. The
  DEF-003 migration also *precondition-asserts* that no job references `app.settings.` — every
  migration below should carry the same assertion, for the same reason.

### R0 — Decisions and credentials (no migration)

Owner rules on §4 (backlog), §5 (TrueLayer shape + Vault `CRON_SECRET`), §6 (secret name, job
names), §10 (manifest criticality). Owner creates the `CRON_SECRET` Vault secret if option A is
chosen. **No secret value is ever written into a migration, a receipt, or this repo.**

Nothing proceeds until R0 closes.

### R1 — Reproduce, on the record

Before any repair. Establish a dated baseline so the "after" means something:
`mcp_http_delivery_health` over a window that spans `:00`, `:07`, `:15`, `:30` and `:45`, recording
`unauthorized > 0`; plus a manual replay of each failing header shape against each function to see
the 401 directly (safe — a rejected call has no side effects, the gate is the first statement in
every one of these handlers). Written up as an audit note, not a migration.

### R2 — Chaser pair (highest value, highest activation risk)

One migration. Preconditions: `pg_cron` and `pg_net` present; the chosen Vault secret exists and is
non-empty; no job references `app.settings.`; the git-named `chaser-tick` / `chaser-trigger-scan`
do not exist; **the backlog condition from §4 is satisfied** (either the due-run count is zero, or
the migration itself performs the agreed quarantine). Then `cron.schedule` both live-named jobs
with a Vault-sourced service-role bearer. Post-assertions: both exist, are active, carry the agreed
schedules, read from `vault.decrypted_secrets`, target the right function paths, contain no
`app.settings.`, contain no literal `eyJ` JWT, and total job count is ≥ 13. Commit removes both
names from `SCHEDULED_OUTSIDE_GIT`.

Split into two migrations (tick, then trigger-scan) if the owner wants the activation staged —
`trigger-scan` creates runs, `tick` sends them, so scheduling `tick` first with the backlog
quarantined is the gentler order.

### R3 — TrueLayer, per the §5 ruling

Under recommendation A: one migration that schedules `truelayer-sync-scheduled` at `*/30` with
`x-cron-secret` from Vault `CRON_SECRET`, and unschedules `truelayer-sync-hourly`. Precondition
must include `vault_secret_exists('CRON_SECRET')` — this is the exact case the DEF-003 comment
warns about ("a job that runs every 30 minutes and 401s every 30 minutes is a worse outcome than no
job at all"). The unschedule is the one genuinely destructive step in this plan; the migration must
assert the surviving job is present and active *before* it removes the other, and the receipt must
record the removed job's full definition so it can be restored.

Removes `truelayer-sync-hourly` from `SCHEDULED_OUTSIDE_GIT`.

### R4 — Daily scans

One migration re-authoring `dormant-lead-scan-daily` (`0 2 * * *`) and `invoice-overdue-scan-daily`
(`0 6 * * *`) with a Vault-sourced service-role **`Authorization`** bearer, dropping the `apikey`
literal. Same precondition/post-assertion shape. Subject to the §4 ruling — the first successful
run of either emits a backlog of automation events.

Empties `SCHEDULED_OUTSIDE_GIT`, which closes the §3.1 "five of thirteen not reproducible" finding
and the `cron-jobs-scheduled-outside-git` new_finding in the DEF-003 receipt.

### R5 — Detection (§10)

Separate increment. Does not schedule anything.

---

## 8. Gate 6 verification

**The rule, stated once:** a green `pg_cron` run proves nothing. `net.http_post` is asynchronous;
the SQL completes and the job is marked *succeeded* whether the response was 200 or 401. This is
recorded in the DEF-019 migration's own comments (`…20260805211212…sql:141-147`) and in the DEF-003
receipt's `worker-authenticates` check. Any verification that reads a cron run status and stops
there is not a verification.

**Reproduce first, then prove the repair behaviourally.**

**Step 1 — reproduce (R1, before touching anything).** Baseline `mcp_http_delivery_health` over a
window covering all four cadence boundaries; record the non-zero `unauthorized` count and the
sampled 401s. Manually replay each job's header shape against its function and observe the 401
body. That is the defect, on the record, dated.

**Step 2 — prove an actual 2xx.** Attribution is the difficulty: the projection returns counts, not
per-job rows. The clean technique needs no join:

> After the repair, sample a window of ≥ 35 minutes that necessarily contains `:00`, `:15`, `:30`
> and `:45` (and, for R3, `:07`). The four failing jobs accounted for **all 29** unauthorized
> responses in the baseline. If `unauthorized` is **0** across such a window while `total` is
> non-trivial and `succeeded_2xx ≈ total`, every previously-failing job has been authorised —
> because those cadences are the only ones that were producing 401s.

Take the baseline and the post-repair sample the same way, over comparable windows, and put both in
the receipt.

**Step 3 — prove it through the product wherever a side effect exists.** Stronger than a status
code, because it proves the function *ran*, not merely that it was let in:

| Job | Product-level proof | Caveat |
|---|---|---|
| `chaser-tick` | A due `automation_chaser_runs` row advances its `next_send_at` and a corresponding `automation_chaser_messages` / `email_queue` row appears | With zero due runs the function returns `{processed: 0}` with no side effect (`chaser-tick/index.ts:61-65`). Needs a fixture, or a real due run |
| `chaser-trigger-scan` | A new `automation_chaser_runs` row for a job matching a configured policy | Needs a policy configured and a matching job |
| `truelayer-sync-scheduled` | A new `bank_sync_logs` row — inserted *before* any provider call (`truelayer-sync-scheduled/index.ts:20`), and unreachable from the 401 branch since the gate is the first statement | With zero `ACTIVE` TrueLayer connections the function returns `{ok:true, processed:0}` and writes nothing (`…:194-207`). Needs a live connection, else fall back to Step 2 |
| `dormant-lead-scan` | A `lead_activity_summary` row with a fresh `refreshed_at` (`dormant-lead-scan/index.ts:62-75`) | Writes only if leads exist outside won/lost/dormant |
| `invoice-overdue-scan` | Structurally identical | Same |

Where a fixture is required, creating it is a **data mutation** and belongs to the approved
increment, not to this plan.

**Step 4 — receipt.** Follow `docs/releases/2026-08-17-def-003-reinstate-email-queue-drain.json`:
every expected object with a `verify_via` that says how to check it independently and an `evidence`
field that records what was actually observed post-apply — not what the migration's own commit
implies. The DEF-003 receipt's `worker-authenticates` entry is the wording model.

---

## 9. Confirming the two daily jobs, given the retention limit

`net._http_response` does not retain a day. A 1440-minute query returned 1,171 rows against 844 in
the preceding four hours, so 02:00Z and 06:00Z fall off before any convenient read.

Three routes, in preference order:

1. **Short-window sample immediately after the boundary** (recommended, no mutation). Call
   `mcp_http_delivery_health(15)` within ten to fifteen minutes of 02:00Z and again after 06:00Z.
   The row is still there; the window is small enough that attribution is trivial, because almost
   nothing else fires at exactly `0 2 * * *`. Costs two timed reads on two consecutive days — one
   pre-repair, one post — and nothing else. This is the honest way to move these two from
   "predicted" to "observed".
2. **Manual header replay** (no waiting, no mutation, but weaker). Reproduce the exact header shape
   — `Content-Type` + `apikey`, no `Authorization` — against `dormant-lead-scan` and observe the
   401. This proves the *mechanism* deterministically but not that the scheduled job exhibits it;
   it is corroboration for route 1, not a replacement. Safe: the rejection precedes every side
   effect.
3. **Temporarily reschedule to a near-term minute.** Fastest, and I recommend against it. It
   mutates live cron state for observational convenience, which is the exact class of out-of-band
   change DEF-020 exists to stamp out. If the owner wants it, it must be done *by migration* with
   the revert in the same transaction-pair and a receipt covering both — never by hand.

Do **not** attempt to lengthen `pg_net` retention. `net._http_response` and its cleanup are
platform-owned, the same ownership wall that makes `cron.job_run_details` unfixable from here.

---

## 10. Detection

Three separate gaps. The first is the one that matters most, and it is not the one currently
flagged.

### 10.1 The smoke test structurally cannot see this defect

`scripts/smoke-test.ts::checkCronJobs` (lines 383-406) calls `get_cron_job_status(p_jobname)`,
which returns `{exists, active, schedule}` and nothing else
(`supabase/migrations/20260620165927_52a23f25-0321-417b-8261-8f7428ae6b05.sql:19-42`). All four
failing jobs **exist and are active**. The smoke test reports them green while the chaser engine is
dead. Raising their `critical` flag changes nothing about that — criticality governs *absence*
detection only.

**Proposal (R5):** add a delivery-health check to the smoke run. A single call to
`mcp_http_delivery_health(<window>)` that fails the run when `unauthorized > 0`, or when
`succeeded_2xx / total` falls below a threshold, converts an invisible failure into a red build.
It is one RPC, already deployed, already granted to `service_role`
(`…20260805211212…sql:204`) — which is the identity the smoke script already uses. This is the
highest-value detection change available and it is cheap.

Caveat to state in the implementation: the projection is estate-wide, so a 401 from *any* source
trips it. That is the correct default for an estate that is supposed to have none, but it means the
check must report the sample errors it gets, or it will be an unactionable red.

### 10.2 `mcp_cron_job_health` is unusable

It times out at a 20-minute window *and* at a 1-minute window (DEF-003 receipt,
`known_verification_gaps`). Narrowing the window not helping is the tell: the `LEFT JOIN
cron.job_run_details … AND d.start_time > now() - interval` (`…20260805211212…sql:123-126`) cannot
use an index on `start_time`, so every call seq-scans the whole run history — which, with several
every-minute jobs, is enormous.

Options:

- **Index `cron.job_run_details.start_time`.** Correct fix; **not available to us**. The relation
  is owned by `supabase_admin` (same wall as DEF-032). Would need a platform escalation, the
  DEF-031 route.
- **Rewrite the projection to reach the run history through an already-indexed column** — filter on
  `jobid` first with a per-job `ORDER BY start_time DESC LIMIT n`, rather than a time-range join
  across all jobs. Plausible and entirely within our control, but it is a guess at the physical
  layout until someone can `EXPLAIN` it, which we cannot do from here.
- **Retire it in favour of `catalog_cron` + `mcp_http_delivery_health`.** Between them these cover
  what the projection was for: existence/schedule from the catalog, delivery outcome from the
  response table. Honest, and cheapest.

**Recommendation:** raise it as its own defect against DEF-019 (the DEF-003 receipt already says it
should be), attempt the rewrite in a *separate* increment with an `EXPLAIN` in hand, and rely on
`catalog_cron` + delivery health meanwhile. Do not attempt it inside a cron-repair increment — it
is a different problem with a different failure mode.

### 10.3 Manifest criticality

Currently only `process-email-queue` is `critical: true` among the 13 (`infra/supabase-manifest.json`,
`cronJobs`). Marking others critical makes a missing job block a deploy.

**This is an owner decision because it tightens a release gate**, and it is recorded as such in the
DEF-003 receipt's `open_questions`. My input: the argument for raising it is strong — the 2026-07-27
audit describes the automation engine, mailbox sync and HMRC CT reconciliation as silently dead
when their jobs fail, which is the definition of critical — but it should be sequenced *after* the
repairs land, not before. Marking a job critical while it is scheduled-but-401ing produces a green
gate on a dead job, which is worse than either state alone. Also note the manifest's
`edgeFunctions` list still carries `sla-check` and `session-cleanup`, which exist nowhere; that
list has not had the reconciliation the `cronJobs` list got, and it is the same noise-trains-out-
the-signal failure the DEF-003 receipt describes.

---

## 11. Acceptance criteria

The repair is complete when **all** of the following hold, each evidenced independently of the
migrations' own commits:

1. A pre-repair `mcp_http_delivery_health` reading is on record showing `unauthorized > 0`, dated,
   with the cadence attribution stated (R1).
2. A post-repair reading over a window spanning `:00`, `:07`, `:15`, `:30`, `:45` shows
   `unauthorized = 0` with `total` non-trivial.
3. At least one **product-level** side effect is observed for the chaser pair and for TrueLayer
   (§8 Step 3), or the receipt records explicitly why no fixture existed and what was substituted.
4. Both daily jobs are confirmed by a short-window sample taken just after 02:00Z and 06:00Z
   (§9 route 1) — before and after.
5. `SCHEDULED_OUTSIDE_GIT` in `src/test/regression/def-003-email-queue-drain.test.ts` is `[]`, and
   the suite passes.
6. No live cron command contains a literal JWT (drift-report §5.1 closed for all five jobs) and
   none references `app.settings.` (DEF-018 not regressed).
7. `cron.job` holds the agreed job set — 13 if the TrueLayer pair is kept, 12 under recommendation
   A — with every name reproducible from a migration in this repository.
8. A release receipt per `docs/releases/production-release-convention.md` exists for each applied
   migration, with `verify_via` and observed `evidence` for every expected object.
9. The §4 backlog ruling is recorded and its handling is visible in the applied SQL.

Criterion 2 alone is not sufficient. Criterion 5 is what makes the estate reproducible, which is
the durable half of this work.

---

## 12. Out of scope

- Changing any edge function body. Option B in §5 is explicitly deferred.
- Weakening or removing any function's auth gate. The gates are correct; the callers are wrong.
- Rotating the anon key, or any credential hygiene beyond removing literals from cron command text.
  The literal anon JWTs in `cron.job.command` disappear as a *side effect* of the repair; a
  deliberate rotation is separate work (drift-report §5.1).
- Fixing `mcp_cron_job_health` (§10.2) — raised, scoped, not designed here.
- Reconciling the manifest's `edgeFunctions` list (§10.3) or its storage-bucket section
  (drift-report §3.2).
- Anything about the Lovable → Supabase migration itself. This plan repairs the *source* estate; it
  does not decide what moves.
- Identifying what removed `process-email-queue` out of band (DEF-020). Unresolved, unchanged.

---

## 13. Owner decisions required

| # | Decision | Blocks |
|---|---|---|
| 1 | **Backlog.** Quarantine due chaser runs, accept the burst, or schedule inactive and activate separately (§4). Is the affected data test data? | R2, R4 |
| 2 | **TrueLayer shape.** A (one job, Vault `x-cron-secret`) / B (change the function) / C (keep both). Recommendation: A. | R3 |
| 3 | **Create Vault secret `CRON_SECRET`** mirroring the existing edge-function env value. Owner-only; no value is written to this repo. | R3 |
| 4 | **Credential name for the chasers** — reuse `email_queue_service_role_key` (recommended) or introduce a distinct name. | R2, R4 |
| 5 | **Job names** — live names canonical (recommended) or rename to the git names. | R2 |
| 6 | **Manifest criticality** for the other twelve jobs (§10.3). Recommendation: raise it, but only after the repairs land. | R5 |
| 7 | **Whether to add a delivery-health gate to the smoke run** (§10.1). Recommendation: yes. | R5 |
| 8 | **DEF ids.** DEF-032 is the highest allocated (`docs/audits/2026-07-28-remediation-plan.md:172`). Proposed: DEF-033 chaser/scan cron 401s, DEF-034 TrueLayer cron 401s, DEF-035 `mcp_cron_job_health` unusable. Allocation is the owner's. | receipts |

---

## 14. What could not be substantiated

Stated plainly, so nothing here is read as stronger than it is.

- **Deployed edge-function bodies are unread.** Every "the function requires X" claim is over git
  HEAD. This repo has a documented history of live-versus-git divergence; if any of these five
  functions is deployed from something other than HEAD, the corresponding root-cause row is wrong.
  R1 (reproduce first) is the control for this.
- **Per-job attribution of the 29 unauthorized responses is arithmetic, not a join.** Counts and
  cadences match exactly. `cron.job_run_details` and `net._http_response` are not directly
  reachable, so no stronger attribution is available from here.
- **`dormant-lead-scan-daily` and `invoice-overdue-scan-daily` have not been observed failing.**
  §2a argues they cannot succeed on git HEAD; that is a prediction with a mechanism, not an
  observation. §9 says how to observe it.
- **That the Vault `email_queue_service_role_key` string equals the `SUPABASE_SERVICE_ROLE_KEY` env
  var** seen by the chaser functions. Proven only that it carries a `service_role` claim
  (`process-email-queue/index.ts:141-149` + DEF-003 Gate 6). The chaser gate is a string equality,
  which is stricter. If R2 lands and the chasers still 401, this is the reason.
- **That the edge-function `CRON_SECRET` env var is set.** Inferred from `server_error = 0` across
  844 responses combined with the 503 branch at `truelayer-sync-scheduled/index.ts:174-177`.
  Clean inference over a four-hour window; not a direct read of the function's environment.
- **One response in 844 is unaccounted for** (§1). Not explained.
- **Whether pg_net sends a JSON-null header value as an empty header or drops it.** Immaterial —
  both fail the comparison — but the exact wire behaviour of `truelayer-sync-hourly`'s
  `x-cron-secret` is not established.
- **The live `cron.job` reading is from `live-inventory.json`, captured 2026-08-17.** Cron state in
  this estate has demonstrably changed out of band before. Re-read `catalog_cron` at the start of
  the approved increment; do not trust this snapshot to still be current.

# Executor escalation — 2026-08-05

**Raised by:** owner ruling, 2026-08-05.
**Executor:** Lovable Cloud.
**Status:** DEF-028 APPLIED AND VERIFIED 2026-08-05. Three releases remain.

**Blocker:** PR #3 (`worktree-def-018-003-cron-and-rpc-repairs`) is not merged, so the executor's checkout does not contain `20260805100000`, `20260805110000` or `20260805160000`. Nothing below can be applied until it is merged to `main`.

Four releases were authored. **DEF-028 is now applied and the portal is unblocked.** The remaining three are listed in mandatory apply order — DEF-019 first, because the DEF-018 evidence gate cannot run without it.

---

## ⚠️ Before applying anything — confirm which database you are on

There are **two** Supabase projects visible from this workspace, and only one is production.

| Project ref | Identity |
|---|---|
| `moxpdejnucjjcplleefn` | **PRODUCTION.** Confirmed from the live `cron.job` command bodies, which post to `https://moxpdejnucjjcplleefn.supabase.co/functions/v1/…`, and from the live catalog reads that produced every finding below. |
| `vazeqolkxinsjvgzqrgj` | **NOT production.** "AccountancyOS's Project", created 2026-07-16. This is the ref returned by the generic Supabase MCP `list_projects`, and therefore the ref its `apply_migration` would write to. |

This matters because the two write paths available in this workspace point at **different
databases**. A migration applied through the generic Supabase connector would land on
`vazeqolkxinsjvgzqrgj`, report success, and change nothing in production — a false green of
exactly the kind Gate 6 exists to catch. Confirm the target ref is `moxpdejnucjjcplleefn`
before applying. This hazard is recorded here because it was found while attempting to
action the DEF-028 escalation.

---

## ✅ DEF-028 — APPLIED AND VERIFIED, 2026-08-05

**Applied version `20260805144648`** on project ref `moxpdejnucjjcplleefn` (target confirmed
before execution). Source sha256 matched the receipt.

Independently confirmed by the reviewing party the same day: the impossible lookup is gone,
`v_contact := NULL` is in place with the reasoning retained, the `contact_attribution` marker
is present, and every other responsibility of the trigger survived. Definition hash moved
`f67d2205` → `fa023bbb`. **The 42703 that broke every portal write since June is closed.**

5 of 7 expected objects PASS. Two could not be exercised and are recorded honestly rather
than claimed: the `bank_transactions` UPDATE branch (the trigger provably fired, but
`sandbox_exec` holds no UPDATE grant on that table, so the branch could not be driven end to
end) and review gating (only one `portal_visibility_settings` row exists org-wide, it is
`operational`, and it cannot be flipped without the same missing grant). The receipt
therefore stays in `pending/` per convention §3. Both are fixture-access limits, not faults.

**Hash note, resolved.** The executor recorded pre-apply `md5(prosrc) = d230bd4e…` against
the receipt's `f67d2205` and flagged a possible discrepancy. It is not one — the two hash
different inputs. `f67d2205` is `md5(pg_get_functiondef(oid))`, which is what
`mcp_list_functions` returns as `definition_hash` and which covers the full `CREATE FUNCTION`
text including the signature and `SET search_path`. The executor measured `md5(prosrc)`, the
body alone. Recording one while instructing the verifier to check the other is a
documentation defect in the receipt, now corrected. Good catch.

---

## 1. DEF-019 — APPLY FIRST. Read-only, and DEF-018 depends on it.

**Release:** `docs/releases/pending/2026-08-05-def-019-cron-and-delivery-observability.json`
**Migration:** `supabase/migrations/20260805160000_def_019_cron_and_delivery_observability.sql`

This exists **because of what the DEF-028 apply revealed**: `cron.job_run_details` and
`vault.decrypted_secrets` are permission-denied to the executor role, and neither is in
`public`, so the reviewing party cannot read them either. The DEF-018 checks as originally
written queried those relations directly — **they could never have passed for anyone.**

It adds three read-only `SECURITY DEFINER` projections in `public`, following the existing
`mcp_list_cron_jobs` pattern. Nothing writes; no existing object is altered.

| Function | Answers |
|---|---|
| `mcp_cron_job_health(minutes)` | per-job runs / succeeded / failed / last status, plus `unrecognized_parameter_failures` — the DEF-018 signature as a first-class count |
| `mcp_http_delivery_health(minutes)` | status-code counts. **This is what separates a delivered call from a 401**, which cron status alone cannot |
| `mcp_vault_secret_present(name)` | boolean only — the DEF-018 pre-check you could not perform |

After applying, please run and send the raw output of:

```sql
SELECT public.mcp_vault_secret_present('email_queue_service_role_key');
SELECT public.mcp_cron_job_health(20);
```

The first is the DEF-018 prerequisite. The second is the first time the 26,208-failure
signature has been queryable at all — the six GUC jobs should show non-zero
`unrecognized_parameter_failures`, which doubles as the pre-apply reproduction for DEF-018.

---

## 2. DEF-028 — done. Retained for the record.

**Release:** `docs/releases/pending/2026-08-03-def-028-portal-provenance-contact-link.json`
**Migration:** `supabase/migrations/20260803140000_def_028_portal_provenance_contact_link.sql`
**Applied:** 2026-08-05 as executor version `20260805144648`.

What was broken, for the record: `stamp_portal_provenance()` resolved the writing contact by
selecting `contact_id` off `public.portal_access`, a column that has never existed. Every
statement reaching that line raised `42703`, and the trigger is attached to `invoices`,
`bills`, `bank_transactions` and `receipts`, returning early only for non-portal callers.
**Every portal write failed, from the function's creation in `20260608112113` until
2026-08-05.** The client portal could never write.

The executor reproduced it before applying — `ERROR: column "contact_id" does not exist`,
`PL/pgSQL function stamp_portal_provenance() line 14` — which is what makes the repair
evidence rather than assertion.

Outstanding from this release, tracked on the receipt:

- `sandbox_exec` cannot UPDATE `bank_transactions` or `portal_visibility_settings`, so two
  branches of a trigger spanning four tables cannot be verified on LIVE **by the party
  applying the change**. That is a verification-capability gap and it will recur on every
  future change to this trigger. Either grant the exec role the narrow UPDATE it needs, or
  land the Phase 0 §4 fixture work already approved.
- `bank_transactions` inserts require `bank_account_id NOT NULL`, hit while building a
  fixture. Worth confirming the portal path always supplies it.
- Whether `portal_access` should carry a real contact FK is an open product decision. Until
  it does, `created_by_contact_id` stays NULL on portal writes and the audit trail records
  `contact_attribution = unresolved_no_portal_contact_link`. Actor attribution is unaffected —
  `bookkeeping_audit_log.actor_id` still records `auth.uid()`.

---

## ⏸ OPEN DECISION — sandbox_exec write access (owner ruling 2026-08-05: settle the premise first)

The executor cannot UPDATE `bank_transactions` or `portal_visibility_settings`, so two
branches of `stamp_portal_provenance` could not be verified on LIVE (see §2). Its stated
preference is a narrow production grant on those two tables. **Deferred pending evidence**,
because the decision rests on a fact neither party has established.

**What is known.** RLS is `enabled` but **not `forced`** on both tables, so the table owner
bypasses RLS entirely. And `anon` already nominally holds UPDATE, INSERT, DELETE and TRUNCATE
on `bank_transactions` — Supabase's default table grants. **RLS, not the grant, is the actual
control on this table.**

**What is not known, and decides it.** Whether `sandbox_exec` is `BYPASSRLS`, or owns these
tables:

- **If it does** — the grant changes nothing it cannot already do, and the real finding is
  that an automated execution role already holds unconstrained write access to ledger source
  data feeding the filing engine. That is a larger issue than the verification gap.
- **If it does not** — RLS constrains it exactly as it constrains `authenticated`, the two
  existing `portal_visibility_settings` policies already permit the UPDATE under
  `user_has_organization_access`, and the grant is routine.

Requested from the executor before any ruling:

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'sandbox_exec';

SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = 'sandbox_exec'
   AND table_name IN ('bank_transactions', 'portal_visibility_settings');
```

**Separate finding, logged regardless of the outcome.** `anon` holding
UPDATE/INSERT/DELETE/TRUNCATE on `bank_transactions` is the Supabase default and is gated by
RLS today, but it means RLS is the single point of failure on ledger source data: disable or
misconfigure one policy and an unauthenticated caller has write access. This is DEF-004
territory (the wider anon surface, still open) and should be assessed there rather than
folded into this decision.

---

## 3. DEF-018 + DEF-003 — apply third (after DEF-019)

**Release:** `docs/releases/pending/2026-08-05-def-018-003-cron-guc-repair.json`
**Migration:** `supabase/migrations/20260805100000_def_018_003_cron_guc_repair.sql`

Six of twelve cron jobs have failed on **every run since creation** — 26,208 consecutive
failures in the audited week — because they read `current_setting('app.settings.*')`, GUCs
that do not exist in this database. The automation engine, inbound mailbox sync and the HMRC
CT poll/delete workers have therefore never run. `process-email-queue` is absent entirely, so
no queued mail has ever been drained on a schedule.

### Prerequisite — check this before applying

The vault secret **`email_queue_service_role_key`** must exist and hold a **current
service-role key**. The migration aborts if it is missing or empty, but it **cannot tell
whether the value is valid** — an invalid key applies cleanly and then 401s on every call.
The `http-calls-are-authorised` check in the receipt is what catches that, and it must be run.

### Do not apply

`supabase/migrations/20260720120000_schedule_process_email_queue.sql` is **superseded**. It
was authored 2026-07-20, never applied, and carries the same GUC defect. Applying it at any
point would re-create `process-email-queue` with the broken pattern and silently undo the
DEF-003 half of this release.

---

## 4. DEF-026 + DEF-027 — apply fourth

**Release:** `docs/releases/pending/2026-08-05-def-026-027-bill-status-and-customer-columns.json`
**Migration:** `supabase/migrations/20260805110000_def_026_027_bill_status_and_customer_columns.sql`

Bill approval raises `23514` (`approve_bill_safe` writes `APPROVED`; the constraint never
permitted it) and customer creation raises `42703` (four columns that do not exist). Both
write paths have never worked. This release also closes a **cross-tenant write** in
`create_customer_safe`: a member of one organisation could attach a customer to another
organisation's client.

---

## Limitation, recorded per owner instruction

**Both `20260805100000` and `20260805110000` are statically validated only. Neither has been
executed against Postgres.**

They are guarded by 44 static assertions over their SQL, and each carries preconditions that
abort before changing anything plus post-assertions that abort the transaction if the end
state is wrong. That is design-time confidence, not execution evidence. Nobody has run these
files against a database — the reviewing party has read-only catalog access to production and
no non-production copy of this schema to rehearse against.

The practical consequence: **expect the possibility of a syntax or catalog error on first
apply.** Both migrations are wrapped in a single transaction and will roll back cleanly if
that happens. `20260803140000` (DEF-028) is not covered by this caveat in the same way — it
was authored on 2026-08-03 by extraction from the live definition — but it too has never been
executed.

---

## Evidence required after deployment — owner requirement, 2026-08-05

A release is **not** complete on apply. Each of the three receipts now carries a
`post_publish_verification` block executed by `scripts/verify-post-publish.ts`, which reads
LIVE via managed `psql` and **refuses to finalize a release if any check fails**. 25 checks
across the three releases.

These checks are the reason the runner matters: they read `cron.job_run_details` and
`net._http_response`, which sit outside the `public` schema and are unreachable through the
connector the reviewing party uses. The runner has the access to close that gap.

The four outcomes the owner requires evidence for map to these checks:

| Required evidence | Checks |
|---|---|
| **All seven scheduled jobs run successfully** | `seven-jobs-present`, `seven-jobs-active`, `all-seven-ran-successfully`, `no-failed-runs`, `no-unrecognized-parameter-errors`, `http-calls-are-authorised`, `http-calls-succeeded` |
| **Portal writes no longer return 42703** | `impossible-lookup-removed`, `no-portal-column-reference-remains`, `all-four-triggers-intact-and-enabled`, plus the behavioural portal write in the apply steps |
| **Bill approval accepts APPROVED** | `bills-status-permits-approved`, `no-bill-outside-canonical-set`, plus the behavioural approval in the apply steps |
| **Cross-tenant customer attachment is rejected** | `customer-fn-enforces-tenancy`, `no-cross-tenant-customer-rows`, plus the behavioural refusal in the apply steps |

Note what the static checks can and cannot do. `all-seven-ran-successfully` proves the SQL
ran; `http-calls-are-authorised` and `http-calls-succeeded` are what prove the requests were
actually accepted, because `pg_cron` records a run as succeeded the moment the command
completes and `net.http_post` returns a request id immediately without waiting for a response.
A job can be green in `cron.job_run_details` while every call it makes returns 401. Both must
pass.

Likewise, `customer-fn-enforces-tenancy` proves the check is present in the body; only the
behavioural call — as a member of org A, passing a client id owned by org B, expecting `42501`
— proves it refuses. **That call succeeds today, which is the point.**

Run, per release:

```
deno run -A scripts/verify-post-publish.ts docs/releases/pending/<release-id>.json
# then, only if every check passed:
deno run -A scripts/verify-post-publish.ts docs/releases/pending/<release-id>.json --finalize --approver=<name>
```

A bare "pass" is not acceptable under convention §6 — the runner records raw per-check
evidence back into the receipt, and that is what closes it.

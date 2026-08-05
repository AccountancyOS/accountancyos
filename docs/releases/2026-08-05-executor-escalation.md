# Executor escalation — 2026-08-05

**Raised by:** owner ruling, 2026-08-05.
**Executor:** Lovable Cloud.
**Status:** OPEN — nothing in this document has been applied.

Three releases are authored, committed, reviewed and waiting. **Production is materially
broken until the first of them is applied.** They are listed in mandatory apply order.

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

## 1. DEF-028 — HIGHEST PRIORITY. Apply first.

**Release:** `docs/releases/pending/2026-08-03-def-028-portal-provenance-contact-link.json`
**Migration:** `supabase/migrations/20260803140000_def_028_portal_provenance_contact_link.sql`
**Authored:** 2026-08-03. **Still not applied as at 2026-08-05.**

### What is broken right now

`stamp_portal_provenance()` resolves the writing contact with:

```sql
SELECT contact_id INTO v_contact FROM public.portal_access
 WHERE user_id = auth.uid() AND is_active = true
 LIMIT 1;
```

`portal_access.contact_id` **does not exist**. Every statement that reaches this line raises
`42703`. The trigger is attached to `invoices`, `bills`, `bank_transactions` and `receipts`,
and it returns early only for non-portal callers — so:

> **Every portal write to invoices, bills, bank transactions and receipts fails. It has
> failed since the function was created in `20260608112113`. The client portal has never
> been able to write.**

This also blocks the portal-capability check in the DEF-001/002 receipt, which is why that
receipt cannot be completed.

### Confirmation that it is still broken

Live read, 2026-08-05, via `mcp_list_functions`: `stamp_portal_provenance` definition hash is
**`f67d2205e089b92c6603834d46f467d1`** — unchanged from the value recorded when the defect was
raised on 2026-08-03 — and the body still contains the impossible lookup verbatim.

### Apply

The migration is self-verifying: a `DO` block asserts the end state before `COMMIT`, including
that all four trigger attachments survive and remain enabled, so a partial apply aborts.

1. Reproduce first (Gate 6): perform a portal invoice create and record the `42703`.
2. Apply `20260803140000_def_028_portal_provenance_contact_link.sql`.
3. Re-run the same portal write and confirm it succeeds.
4. Run the receipt's `post_publish_verification` block:
   `deno run -A scripts/verify-post-publish.ts docs/releases/pending/2026-08-03-def-028-portal-provenance-contact-link.json`
5. Report the executor's applied version so it can be recorded in
   `docs/audits/unapplied-migrations-baseline.json`.

---

## 2. DEF-018 + DEF-003 — apply second

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

## 3. DEF-026 + DEF-027 — apply third

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

# AccountancyOS Launch-Readiness Programme — Audit Report

- Baseline commit: `d7aca9be9c0af1d28b3d67695888d1529dd6afc6` (2026-07-27 21:22:33 +0000)
- Latest applied migration: `20260727205037`
- Tenant under test: Blue Tick Accountants (`a857a12c-a125-41de-bb45-9eb556d5b467`)
- Identity: live owner `leon@bluetickaccountants.com`
- Status: **IN PROGRESS** — Phases 1–7 executed; Phase 0 blocked on owner rulings, Phase 8 deferred

---

## Verdict so far

**NOT LAUNCH-READY.** Three P1 defects block Gate 3 (core commercial journey) and
Gate 6 (no silent failure). All are confirmed against LIVE, not inferred.

The happy path itself is in better shape than the defect count suggests: lead →
quote → send → public acceptance → engagement letter → AML upload → client details
→ billing → accountant review → AML verification → client + job creation → portal
invite → portal login all completed end-to-end with **zero console or network
errors**. The blockers are in delivery (email never leaves the queue), in the
purchase-ledger and automation surfaces, and in team/role administration.

The dominant pattern across every P1/P2 found so far is the same: **the UI
reports success while the underlying operation did nothing, and no error reaches
the user.** That is five distinct Gate 6 violations (DEF-003, DEF-006, DEF-012,
DEF-013, and the DEF-001 RPC family). Gate 6 should be treated as the single
largest launch risk, ahead of any individual defect.

---

## Defect register

### DEF-001 — P1 — Ten production RPCs abort with SQLSTATE `42883`

**Phase:** 1 (Preflight) · **Gate impact:** 3, 4, 6 · **Status:** OPEN

Ten live `SECURITY DEFINER` RPCs call `public.set_rpc_context()`. That function
**does not exist in any schema** (`pg_proc` returns zero rows for `%rpc_context%`).
Every call therefore aborts before doing any work.

Observed against LIVE via PostgREST:

```
POST /rest/v1/rpc/approve_bill_safe
HTTP 404
{"code":"42883","message":"function public.set_rpc_context() does not exist"}
```

Affected functions and their app call sites — all are reachable from the UI:

| Function | Called from | Business capability lost |
|---|---|---|
| `approve_bill_safe(p_bill_id)` | `src/lib/bills-safe-service.ts` | Bill approval |
| `void_bill_safe(p_bill_id, p_reason)` | `src/lib/bills-safe-service.ts` | Bill voiding |
| `record_bill_payment_safe(...)` | `src/lib/bills-safe-service.ts` | Recording supplier payments |
| `create_customer_safe(...)` | `src/lib/customer-safe-service.ts` | Customer creation |
| `create_invoice_draft_safe(...)` *(legacy overload)* | `src/lib/invoice-draft-service.ts` | Invoice drafting |
| `update_invoice_draft_safe(...)` *(legacy overload)* | `src/lib/invoice-draft-service.ts` | Invoice drafting |
| `create_automation_rule_safe(...)` | `src/lib/automation-rule-service.ts` | Automation rule creation |
| `update_automation_rule_safe(...)` | `src/lib/automation-rule-service.ts` | Automation rule editing |
| `delete_automation_rule_safe(p_rule_id)` | `src/lib/automation-rule-service.ts` | Automation rule deletion |
| `toggle_automation_rule_safe(p_rule_id, p_is_active)` | `src/lib/automation-rule-service.ts` | Enabling/disabling automations |

**Root cause (from git history):** migration `20251217223244` created
`set_rpc_context()`; `20251217225814` dropped it `CASCADE` and was supposed to
recreate every dependent RPC with `set_config` inlined; `20260407140850` dropped
it again. The live bodies of the ten functions above were never re-issued with
the inlined form, so they still reference the deleted helper. This is exactly the
Git-vs-live drift class the release convention was written to catch — the
detective baseline did not cover function bodies, only presence.

**Consequence:** the entire purchase-ledger approval path and the entire
automation-rule management surface are non-functional in production. The
automation *engine* may still execute pre-existing rules, but no rule can be
created, edited, toggled or deleted.

**Remediation owner:** requires a git-authored migration re-issuing the ten
function bodies with `set_config` inlined. Per the production release convention
this is not a Lovable hand-patch.

---

### DEF-002 — P1 — Overload ambiguity breaks invoice draft RPCs (`PGRST203`)

**Phase:** 1 (Preflight) · **Gate impact:** 3, 4 · **Status:** OPEN

`create_invoice_draft_safe` and `update_invoice_draft_safe` each exist **twice**
in `public` with different signatures — one healthy, one carrying the DEF-001
defect. PostgREST cannot disambiguate:

```
POST /rest/v1/rpc/update_invoice_draft_safe
HTTP 300
{"code":"PGRST203","message":"Could not choose the best candidate function between:
 public.update_invoice_draft_safe(...), public.update_invoice_draft_safe(...)"}
```

The two overloads differ in `p_contact_email` presence and `date` vs `text` typing
for `p_issue_date` / `p_due_date`. Resolution depends on the exact key set the
client sends, so behaviour is non-deterministic across call sites.

**Remediation:** drop the superseded overload in the same git migration as DEF-001.

---

### DEF-003 — P1 — `process-email-queue` cron absent from production

**Phase:** 1 (Preflight) · **Gate impact:** 4, 6, 9 · **Status:** OPEN

**Upgraded to a Gate 3 blocker after Phase 3 testing.** Sending quote Q-26-0002
through the UI reported "Quote Sent", moved the quote to `SENT`, and rendered a
"Quote Sent" milestone — but the email row was written to `email_queue` with
`status='pending'` and `scheduled_at = created_at + 15 minutes`, and there is no
cron to drain it. A quote sent 50 minutes earlier was still `pending` at the time
of testing. **No quote email has ever actually been delivered from this instance.**

This is also the cleanest Gate 6 violation found so far: total UI success, zero
errors surfaced, nothing delivered.

`infra/supabase-manifest.json` declares `process-email-queue` as `critical`, but
it is not present in `cron.job` on LIVE. `email_send_log` holds 49 rows stuck at
`pending`, the oldest dating to June. Today's rows show a `pending` row followed
one second later by a *separate* `sent` row rather than a status transition,
which means the log cannot be trusted as a delivery record either.

**Consequence:** queued mail is not drained on a schedule. Any workflow that
relies on the queue rather than a direct invoke will silently never deliver.

---

### DEF-004 — P2 — 326 `SECURITY DEFINER` functions are `EXECUTE`-able by `anon`

**Phase:** 7 (Security) · **Gate impact:** 1 · **Status:** OPEN (no breach proven)

The security scan reports 326 `SECURITY DEFINER` functions callable without
signing in, plus 343 callable by any signed-in user regardless of tenant.

Adversarial probes with the anon key were run against a sample of the
highest-privilege functions. **No authorisation bypass was demonstrated** — each
enforced its own internal check:

| Probe (anon key) | Result |
|---|---|
| `add_org_member(fake_org, fake_user, 'staff')` | `P0001` "Only owners can add members directly." |
| `cancel_stale_onboarding_applications(fake_org)` | `P0001` "Access denied" |
| `can_post_journals(fake_user, real_org)` | `200 false` |
| `approve_filing_safe(fake_filing)` | `200 {"success":false,"error":"Filing not found"}` |

Classified **P2, not P0**: the tenancy boundary held everywhere it was tested, so
this is a defence-in-depth and attack-surface finding rather than a live
vulnerability. It is *not* cleared, because 326 functions were not exhaustively
probed and `approve_filing_safe` answers existence questions to anonymous callers
before authorising (a low-grade enumeration oracle).

**Recommendation:** `REVOKE EXECUTE ... FROM anon` across the set except the
deliberately public `public_*` token-scoped RPCs, and reorder `approve_filing_safe`
to authorise before it looks the record up.

---

### DEF-005 — P3 — 14 functions have mutable `search_path`

**Phase:** 7 · **Gate impact:** 1 · **Status:** OPEN

Standard linter warning `0011`. Low risk given all are in `public`, but should be
pinned before launch.

---

### DEF-006 — P2 — `get_bank_connection_health_for_org` fails with `42702`

**Phase:** 4 (Bookkeeping) · **Gate impact:** 4 · **Status:** OPEN

`/bookkeeping` fires this RPC three times per load and every call fails:

```
POST /rest/v1/rpc/get_bank_connection_health_for_org
HTTP 400 {"code":"42702","message":"column reference \"organization_id\" is ambiguous"}
```

The `RETURNS TABLE(...)` OUT parameter `organization_id` collides with the column
of the same name inside the function body. Bank connection health is therefore
never displayed. The page renders regardless and shows no error to the user —
a second Gate 6 silent failure.

**Recommended fix (git-authored):** add `#variable_conflict use_column`, or
prefix the OUT parameters (`out_organization_id`, …).

---

### DEF-007 — P3 — `/jobs` issues a `406` on every load

`GET /rest/v1/user_saved_views?...&is_default=eq.true` uses `.single()` where no
default view exists, returning `PGRST116 "Cannot coerce the result to a single
JSON object"`. Harmless but pollutes the console and any error telemetry.
Fix: use `maybeSingle()`.

---

### DEF-008 — P3 (revised) — Portal custom-domain aliases are served on the accountant origin

**Revised after the Phase 4 route sweep.** Seven unqualified paths — `/banking`,
`/documents`, `/messages`, `/payments`, `/profile`, `/questionnaires`, `/tasks`
(plus `/dashboard`, `/login`, `/invite`, `/forgot-password`, `/reset-password`) —
are portal custom-domain aliases (`src/App.tsx` 606-623) intended for
`client.accountancyos.com`. They are mounted unconditionally, so on the
accountant origin a signed-in practice owner who reaches any of them gets
"No portal access".

Downgraded from a functional break to a hygiene/routing issue: a codebase search
found **no** accountant-side `<Link to>` or `navigate()` to any of these paths,
so they are not reachable from the accountant UI — only by typed/bookmarked URL.
**Fix:** gate the alias block on the portal hostname, or redirect non-portal
sessions to `/overview` instead of rendering the wall.

---

### DEF-012 — P2 — Team Permissions never loads (`PGRST200`)

**Phase:** 4 · **Gate impact:** 1, 4, 6 · **Status:** OPEN

`/settings/permissions` is stuck on "Loading team members…" indefinitely:

```
GET /rest/v1/organization_users?select=id,user_id,role,created_at,profiles:user_id(...)
HTTP 400 {"code":"PGRST200","message":"Could not find a relationship between
 'organization_users' and 'user_id' in the schema cache"}
```

There is no foreign key from `organization_users.user_id` to `profiles`, so the
embed cannot resolve. **Role administration is entirely unavailable** — an owner
cannot see, invite, or change the role of any team member. Given the three-role
security model this is a governance gap, not just a broken page. The page shows
no error; it simply spins (third Gate 6 silent failure).

**Fix options:** add the FK and reload the schema cache, or split into two
queries (`organization_users`, then `profiles` by `user_id in (...)`).

---

### DEF-013 — P2 — Email signature settings query a non-existent column (`42703`)

**Phase:** 4 · **Gate impact:** 4, 6 · **Status:** OPEN

`/settings/my-profile` fires:

```
GET /rest/v1/organization_users?select=email_signature&organization_id=eq.…&user_id=eq.…
HTTP 400 {"code":"42703","message":"column organization_users.email_signature does not exist"}
```

The signature field renders empty and any saved value cannot be read back. Per
the page's own copy the signature is "automatically appended to engagement
letters and outbound system emails", so every outbound letter goes out unsigned.
Again surfaced with no user-visible error.

---

### DEF-014 — P4 — `validateDOMNesting` warning on Automation Settings Centre

`/settings/automations` logs a nested-`<button>` React warning. Cosmetic; fix by
swapping the inner control for a non-button element or using `asChild`.

---

### DEF-009 — P3 — US date format on the quote detail milestone

The quote timeline renders `Sent 7/27/2026` while every adjacent field uses
`27 July 2026`. Violates the project's UK formatting standard.

---

### DEF-010 — P3 — Overlapping / zero-priced entries in the services catalogue

The quote builder offers `MTD Quarterly Filing — £35.00/year` alongside
`MTD Quarterly Submission — £75.00/year`, and `Self-Assessment (MTD) — £35.00/year`
alongside `MTD Final Declaration — £35.00/year`. Three services are priced at
£0.00 (`LLP accounts production`, `Sole trader accounts`, `Trust Registration
Service`). A user cannot tell which to quote. Product decision required.

---

### DEF-011 — P3 — Accountant-side org lookup runs inside the client portal

**Phase:** 3 (Portal) · **Gate impact:** 6 · **Status:** OPEN

Every authenticated `/portal/*` page fires
`GET /rest/v1/organization_users?select=organization_id&user_id=eq.<portal user>`
**four times**, each returning `406 PGRST116` because a portal user has no
`organization_users` row and the call uses `.single()`. Reproduced on all seven
portal routes (dashboard, tasks, documents, questionnaires, messages, payments,
settings). Functionally harmless — every page renders correctly — but it means
the accountant-side org context is being resolved inside the portal shell, which
is both wasted round-trips and console/telemetry noise. Fix: skip the lookup for
portal sessions, and use `maybeSingle()`.

---

## Phase 3 — Core commercial journey (PASS with blockers)

Executed against LIVE as `leon@bluetickaccountants.com`, then anonymously as the client.

| Step | Result | Evidence |
|---|---|---|
| Create lead via CRM UI | **PASS** | `leads.id 33e42ab2-…`, stage `new` |
| Open lead detail, Quotes tab | **PASS** | Tabs: Overview/Activity/Quotes/Messages/Emails/Docs |
| Build quote from services catalogue | **PASS** | `Q-26-0002`, £150.00 one-off |
| Send quote | **PARTIAL — DEF-003** | Status→`SENT`, email stuck `pending` |
| Public quote view (anonymous, no session) | **PASS** | Renders lines, totals, Accept/Decline |
| Accept proposal | **PASS** | Straight into onboarding — **no stall**; the earlier `onboarding_access_token` fix holds |
| Re-open used token | **PASS** | Resumes at the correct step; idempotent |
| Sign engagement letter | **PASS** | Advances to AML |
| Upload 2 AML documents | **PASS** | 2 rows in `onboarding_documents` |
| Client details (DOB/NINO/UTR/address) | **PASS** | Advances to Billing |
| Billing acknowledgement (no Stripe connected) | **PASS** | Correct fallback copy |
| Portal account submission | **PASS** | Application reached `status='for_review'` |
| Accountant review screen | **PASS** | Captured details + commercial snapshot render correctly |
| AML verification | **PASS** | Checklist enabled once both documents present; verified in one action |
| Approval side effects | **PASS** | `clients` row `f1565f89-…` created (`status=active`); job `67ead073-…` materialised (`generation_reason=onboarding_approval:6bb5670c-…`); `portal_access` invite issued |
| Portal invite acceptance | **PASS** | Name/email/password accepted, landed on `/portal/dashboard` authenticated |
| Portal route sweep (7 routes) | **PASS with DEF-011** | All render; AML uploads visible under Documents |
| AML/portal-invite email delivery | **FAIL — DEF-003** | Both queued `pending` with `scheduled_at = created_at + 15m`; never drained |

The AML "Verify" action was initially read as blocked; it is not a defect —
the button is correctly gated behind a three-item verification checklist which
enables once both an ID document and a proof of address are present.

Notably, the previously reported "Database error checking email" did **not**
reproduce on this run.

---

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements freeze | BLOCKED — awaiting owner rulings |
| 1 | Environment preflight | PARTIAL — DEF-001..005 raised |
| 2 | Catastrophic-risk tests | SUPERSEDED — see revised phase table at end of report |
| 3 | Core commercial journey | COMPLETE — end-to-end lead → quote → acceptance → onboarding → AML → approval → client → portal login all PASS; only email delivery (DEF-003) fails |
| 4 | Module coverage | LARGELY COMPLETE — 37-route sweep executed; DEF-006/007/008/012/013/014 raised; bills/invoices/automations still blocked by DEF-001/002 |

---

## Phase 4 — Module coverage route sweep

37 accountant routes were loaded in sequence against LIVE as the practice owner,
capturing console errors, page errors and every HTTP >= 400.

**Clean (rendered correctly, zero errors):** `/overview`, `/crm`, `/clients`,
`/emails`, `/services`, `/quotes`, `/onboarding`, `/workpapers`, `/deadlines`,
`/filings`, `/templates`, `/automations`, `/subscription`, `/settings`,
`/settings/branding`, `/settings/companies-house`, `/settings/crm-sequences`,
`/settings/email-preferences`, `/settings/email-templates`,
`/settings/engagement-letters`, `/settings/hmrc`, `/settings/job-templates`,
`/ops/health`.

**Errored:** `/bookkeeping`, `/payroll`, `/cis` (all three resolve to the
bookkeeping shell and all three fire DEF-006); `/jobs` (DEF-007);
`/settings/permissions` (DEF-012); `/settings/my-profile` (DEF-013);
`/settings/automations` (DEF-014).

**Not accountant routes:** the seven DEF-008 aliases.

### Mitigation available for DEF-003

`/emails` exposes a **Process Queue** button that invokes `process-email-queue`
directly (`src/pages/Settings.tsx:233`). It confirms the diagnosis — the function
is deployed and callable, only the *schedule* is missing — and gives operations a
manual drain. It was deliberately **not** clicked during this run: two of the
four queued recipients are `@accountancyos.test` addresses that would hard-bounce
and write permanent rows into `suppressed_emails`. Draining the queue should
happen after the test rows are purged in Phase 8.
| 5 | Non-functional readiness | NOT STARTED |
| 6 | Operational readiness | NOT STARTED |
| 7 | Security & deployment integrity | PARTIAL — DEF-004/005 raised |
| 8 | Cleanup verification | NOT STARTED |

## Blockers on the owner

The six environment rulings raised previously (restore rehearsal, monitoring,
second tenant, staff/admin fixtures, multi-practice identity, performance seeding)
remain outstanding and gate Phase 0, Phase 5 and Phase 6.

DEF-001, DEF-002 and DEF-006 all require git-authored migrations. Per the
production release convention these are not Lovable hand-patches.

## Cleanup owed (Phase 8)

See `creation-ledger.json`. Nothing has been deleted yet — the records are left
in place deliberately so the defects above remain reproducible.
---

## Phase 5 — Non-functional readiness (INFORMATIONAL)

Executed against LIVE. Blue Tick holds near-zero volume (largest public table is
`templates` at 104 rows; `clients`, `jobs`, `deadlines` are single-digit), so these
numbers characterise the *shape* of the queries, not real-world load. Production-sized
seeding remains one of the outstanding owner rulings.

### API latency (PostgREST, authenticated owner, 5 samples each)

| Endpoint | Status | Median | Max |
|---|---|---|---|
| `clients?select=*&limit=100` | 200 | 92 ms | 190 ms |
| `jobs?select=*&limit=100` | 200 | 173 ms | 180 ms |
| `deadlines?select=*&limit=100` | 200 | 94 ms | 94 ms |
| `quotes?select=*,quote_lines(*)&limit=100` | 200 | 90 ms | 157 ms |
| `email_queue?select=*&limit=100` | 200 | 87 ms | 168 ms |
| `audit_log?select=*&limit=100` | 200 | 98 ms | 121 ms |

All well inside budget at this volume. No endpoint is pathological.

### Route render timings (dev server, 3 samples each)

`/overview` 2829 ms · `/clients` 2692 ms · `/jobs` 2609 ms · `/deadlines` 2554 ms ·
`/quotes` 2492 ms · `/crm` 2408 ms · `/workpapers` 2587 ms · `/emails` 2576 ms.

These are **not** production numbers: each load issued ~633 requests because the dev
server serves unbundled ES modules. They are recorded only to show no route is an
outlier. Production timings must be measured against the published build.

### DEF-017 — P3 — 324 of 723 foreign keys have no supporting index

**Phase:** 5 · **Gate impact:** 8 · **Status:** OPEN

Live query over `pg_constraint`/`pg_index` shows 723 foreign keys in `public`, of which
324 have no index on the referencing column. At current volume this is invisible.
At production volume it degrades every tenant-scoped join and, more seriously, makes
`ON DELETE CASCADE` (see DEF-016, 34-table radius) a full table scan per child table.

`pg_stat_user_tables` already shows the pattern forming: `email_queue` 218,987
sequential scans, `organization_users` 137,284, `portal_access` 10,548 — all against
tables of 1–14 rows, so the planner is choosing seq scan because the row count is
trivial, but the access paths are hot and will not stay trivial.

**Remediation:** git-authored migration adding indexes on FK referencing columns,
prioritised by the hot tables above.

---

## Phase 6 — Operational readiness

### DEF-018 — P1 — Six of twelve production cron jobs have failed on every run

**Phase:** 6 · **Gate impact:** 6, 9 · **Status:** OPEN · **Severity:** P1

`cron.job_run_details` over the last 7 days:

| Job | Schedule | Runs (7d) | Status |
|---|---|---|---|
| `hmrc-ct-poll-worker` | `* * * * *` | 10,080 | **FAILED — 100%** |
| `sync-gmail-emails` | `*/2 * * * *` | 5,040 | **FAILED — 100%** |
| `sync-outlook-emails` | `*/2 * * * *` | 5,040 | **FAILED — 100%** |
| `hmrc-ct-delete-worker` | `*/5 * * * *` | 2,016 | **FAILED — 100%** |
| `process-automation-events` | `*/5 * * * *` | 2,016 | **FAILED — 100%** |
| `workflow-tick` | `*/5 * * * *` | 2,016 | **FAILED — 100%** |
| `chaser-tick-every-15min` | `*/15 * * * *` | 672 | succeeded |
| `chaser-trigger-scan-every-6h` | `0 */6 * * *` | 28 | succeeded |
| `truelayer-sync-scheduled` | `*/30 * * * *` | 336 | succeeded |
| `truelayer-sync-hourly` | `7 * * * *` | 168 | succeeded |
| `dormant-lead-scan-daily` | `0 2 * * *` | 7 | succeeded |
| `invoice-overdue-scan-daily` | `0 6 * * *` | 7 | succeeded |

Every failing job returns the identical message:

```
ERROR:  unrecognized configuration parameter "app.settings.supabase_url"
```

The six failing jobs were written to resolve their target URL and service-role key from
`current_setting('app.settings.supabase_url')` / `('app.settings.service_role_key')`.
Those GUCs do not exist in this database. The four healthy jobs hard-code the project
URL and anon key instead. **26,208 consecutive failures in seven days and not one of
them surfaced anywhere in the product.**

Functional consequence, confirmed by the job list rather than inferred:

- **Automation engine does not run.** `process-automation-events` and `workflow-tick`
  are the only drivers of `automation_events` → `automation_executions` and of
  `automation_workflow_instances`. Every multi-step automation is inert.
- **Email sync does not run.** `sync-gmail-emails` and `sync-outlook-emails` are the
  only inbound path for connected mailboxes; `email_messages` receives nothing.
- **HMRC CT poll/delete workers do not run.** Submission state is never reconciled
  back from HMRC.

This supersedes DEF-003 in scope: the email queue was one missing schedule; this is
half the scheduled estate dead on arrival. It is also the single clearest Gate 6
violation found in the whole programme — a 100% failure rate sustained for weeks with
no detection.

**Remediation:** git-authored migration re-issuing the six `cron.schedule` bodies with
the same hard-coded URL + key pattern the four healthy jobs use, or setting the two
GUCs at database level. Per the release convention this is not a Lovable hand-patch.

### DEF-019 — P2 — No alerting layer exists

**Phase:** 6 · **Gate impact:** 9 · **Status:** NOT IMPLEMENTED

Repository-wide search for any alerting or error-reporting integration (Sentry,
PagerDuty, Opsgenie, threshold configuration) returns zero matches across `src/` and
`supabase/`. There is no threshold, no destination, no owner, no runbook and no tested
alert delivery.

Detection *signal* does exist and is queryable — `cron.job_run_details`,
`email_send_log`, `email_queue`, `automation_executions`, `audit_log`,
`bank_sync_logs`, edge-function logs — but nothing consumes it. DEF-018 is the proof:
the signal was sitting in `cron.job_run_details` for weeks and no one was told.

Gate 9 is **NOT IMPLEMENTED**, not failed. It materially caps the launch cohort.

### Backup and recovery

Managed backups exist at the platform level. Restore-into-a-safe-environment is not
available from here, so recovery cannot be rehearsed. Per the programme's own rule this
is **INSUFFICIENT EVIDENCE**, not PASS. Gate 7 remains unmet and needs an owner-named
residual-risk acceptance or an out-of-band rehearsal.

### DEF-020 — P3 — Release-integrity probes cover 2 of 62 edge functions

**Phase:** 6 · **Gate impact:** 10 · **Status:** OPEN

Only `companies-house-sync` and `ch-officers` carry a `VERSION.ts` identity probe.
The other 60 deployed functions cannot be independently verified against a git commit,
so the detective control the release convention depends on covers 3% of the estate.

Schema drift is equally undetectable by version string: git holds 495 migration
versions, LIVE `supabase_migrations.schema_migrations` holds 393 rows, because
Lovable re-stamps applied migrations with its own timestamp. Version identity between
git and live therefore does not exist. This is the architectural limitation already
recorded in the convention (§10) and it is confirmed empirically here.

---

## Phase 7 — Security and deployment integrity (completed)

### DEF-015 refined — the anon-executable surface is 93 functions, enumerated

The Phase 2 sample is now a definitive list. Filtering `SECURITY DEFINER` functions in
`public` that (a) `anon` may execute, (b) do not return `trigger`, and (c) contain no
reference to `auth.uid()`, `auth.role()`, a token check, a role check or
`current_setting` anywhere in their body yields **93 functions**.

They fall into four risk classes:

1. **Data disclosure on a caller-supplied UUID** — `find_entities_by_email`,
   `get_trial_balance_from_ledger`, `get_general_ledger_from_ledger`,
   `get_org_settings_safe`, `get_portal_kpis_for_entity`,
   `get_portal_bank_accounts_for_entity`, `get_portal_entities_for_user`,
   `get_portal_visibility_for_entity`, `get_active_vat_registration`,
   `el_signature_progress`. Confirmed live: `find_entities_by_email` returned a real
   client record with the anon key and no session.
2. **Schema disclosure** — `mcp_list_schema`, `get_check_constraint_values`,
   `get_cron_job_status`. Confirmed live: full schema dump.
3. **State mutation on a caller-supplied UUID** — `add_service_to_client`,
   `create_job_from_template`, `lifecycle_create_manual_job`,
   `grant_person_portal_access`, `emit_automation_event`, `enqueue_email`,
   `delete_email`, `move_to_dlq`, `cancel_stale_onboarding_applications`,
   `governance_record_merge_field`, `create_test_ct600_filing`,
   `seed_default_chart_of_accounts`, `ensure_org_settings`. `grant_person_portal_access`
   and `enqueue_email` are the sharpest: portal access granting and outbound mail
   injection.
4. **Permission oracles** — the `can_*` / `get_user_role` / `has_portal_role` family,
   which will answer authorisation questions for any user id and org id.

An organisation UUID is not a secret; it travels in public quote and onboarding links.

**Remediation:** git-authored migration issuing
`REVOKE EXECUTE ... FROM anon, PUBLIC` across the list, re-granting only to
`authenticated`/`service_role`, and adding an explicit caller check inside the small
number that legitimately need anonymous reach (the public quote/onboarding token RPCs,
which already gate on a token and are therefore excluded from the 93).

### Auth configuration (live `/auth/v1/settings`)

| Setting | Value | Assessment |
|---|---|---|
| `anonymous_users` | `false` | PASS |
| `mailer_autoconfirm` | `false` | PASS — email confirmation enforced |
| `phone_autoconfirm` | `false` | PASS |
| `saml_enabled` | `false` | expected |
| `passkeys_enabled` | `false` | expected |
| `email` provider | `true` | expected |
| **`google`** | **`false`** | **DEF-021** |
| `disable_signup` | `false` | **DEF-022** |

### DEF-021 — P2 — Google sign-in is advertised but not enabled

**Phase:** 7 · **Gate impact:** 2 · **Status:** OPEN

The documented authentication model is email/magic link **plus Google OAuth**, and the
sign-in surface offers it. The provider is disabled in live auth configuration, so the
first user to click it receives `Unsupported provider`. Either enable and configure the
provider or remove the control from the sign-in surfaces.

### DEF-022 — P3 — Public signup is open on the accountant application

**Phase:** 7 · **Gate impact:** 2 · **Status:** OPEN — needs an owner ruling

`disable_signup` is `false`, so anyone on the internet can create an `auth.users`
identity against the practice application. It is not a tenancy breach — organisation
creation is gated behind `create_organization_with_owner` and billing — but it does
permit unbounded identity creation, which is an abuse and cost vector and pollutes the
identity table that already produced two orphaned-identity incidents. Whether to close
it depends on whether self-serve practice signup is a launch requirement.

### Storage

Nine buckets. Eight are private. Only `branding` is public, which is correct for logo
assets served into emails and portal headers, and it holds one object. Statutory and
client-confidential buckets — `onboarding-documents` (18 objects), `filing-documents`,
`workpaper-files`, `job-documents`, `receipts`, `questionnaire-files`, `invoice-pdfs`,
`invoice-branding` — are all private. **PASS.**

### Secret handling in edge functions

Repository-wide scan for secrets reaching a log line, response body or client returns
two matches, both safe: `truelayer-callback` logs the *fact* of a successful token
exchange without the token, and `auth-email-hook` logs the *absence* of a configured
key. No secret material is logged, returned or echoed. **PASS.**

---

## Phase status (revised 2026-07-28)

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements freeze | BLOCKED — six owner rulings outstanding |
| 1 | Environment preflight | COMPLETE — DEF-001..005 carried; DEF-023/024/025 raised |
| 2 | Catastrophic-risk tests | COMPLETE — RLS coverage and immutability PASS; DEF-015, DEF-016 raised |
| 3 | Core commercial journey | COMPLETE — journey PASS, delivery FAIL (DEF-003) |
| 4 | Module coverage | LARGELY COMPLETE — DEF-006/007/008/012/013/014 |
| 5 | Non-functional readiness | COMPLETE (informational) — DEF-017 |
| 6 | Operational readiness | COMPLETE — DEF-018 (P1), DEF-019 NOT IMPLEMENTED, DEF-020; Gate 7 INSUFFICIENT EVIDENCE |
| 7 | Security & deployment integrity | COMPLETE — DEF-015 enumerated, DEF-021, DEF-022; storage and secret handling PASS |
| 8 | Cleanup verification | DEFERRED — awaiting owner go-ahead |

## Revised verdict

**NOT LAUNCH-READY. Recommended verdict: CONDITIONAL GO at "Blue Tick internal use
only".**

Four P1 defects now stand: DEF-001 (RPC family), DEF-002 (overload ambiguity),
DEF-003 (email never dispatched), DEF-018 (half the scheduled estate dead), plus
DEF-015 and DEF-016 carried from Phase 2 as catastrophic-class.

The through-line is unchanged and is now beyond argument. **Gate 6 — no silent
failure — is the single largest risk in this product.** DEF-018 is its purest example:
26,208 consecutive cron failures over seven days, covering the automation engine,
inbound email sync and HMRC reconciliation, with no error anywhere in the UI, no alert,
and no operator awareness. The audit found it by querying `cron.job_run_details`
directly. Nothing in the product would ever have told you.

Set against that, two areas are genuinely strong and should not be lost in the defect
count: **RLS coverage** (226 tables, zero without RLS, zero without policies, no
`USING (true)` on tenant data) and **Filing Engine immutability** (snapshot mutation
blocked by trigger, append-only audit logs, period locks and portal write-blocks all
enforced in the database rather than the application). Storage posture and secret
handling also pass cleanly.

Remediation sequence recommended: **DEF-015** (exploitable from the open internet
today) → **DEF-018** (silently disables three subsystems) → **DEF-003** → **DEF-016**
→ **DEF-001/002** → **DEF-019** (monitoring, which is what would have caught DEF-018).
All are schema or infrastructure changes and therefore belong in git-authored
migrations from you, not Lovable hand-patches.

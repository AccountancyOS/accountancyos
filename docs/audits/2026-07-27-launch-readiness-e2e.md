# AccountancyOS Launch-Readiness Programme — Audit Report

- Baseline commit: `d7aca9be9c0af1d28b3d67695888d1529dd6afc6` (2026-07-27 21:22:33 +0000)
- Latest applied migration: `20260727205037`
- Tenant under test: Blue Tick Accountants (`a857a12c-a125-41de-bb45-9eb556d5b467`)
- Identity: live owner `leon@bluetickaccountants.com`
- Status: **IN PROGRESS** — Phase 1 complete; Phase 3 (core commercial journey) largely complete

---

## Verdict so far

**NOT LAUNCH-READY.** Three P1 defects block Gate 3 (core commercial journey) and
Gate 6 (no silent failure). All are confirmed against LIVE, not inferred.

The happy path itself is in better shape than the defect count suggests: lead →
quote → send → public acceptance → engagement letter → AML upload → client details
→ billing all completed end-to-end with **zero console or network errors**. The
blockers are in delivery (email never leaves the queue) and in the purchase-ledger
and automation surfaces.

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
| 2 | Catastrophic-risk tests | NOT STARTED |
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
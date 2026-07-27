# AccountancyOS Launch-Readiness Programme — Audit Report

- Baseline commit: `d7aca9be9c0af1d28b3d67695888d1529dd6afc6` (2026-07-27 21:22:33 +0000)
- Latest applied migration: `20260727205037`
- Tenant under test: Blue Tick Accountants (`a857a12c-a125-41de-bb45-9eb556d5b467`)
- Identity: live owner `leon@bluetickaccountants.com`
- Status: **IN PROGRESS** — Phase 1 (Environment Preflight) partially complete

---

## Verdict so far

**NOT LAUNCH-READY.** Two P1 defects already block Gate 3 (core commercial journey)
and Gate 6 (no silent failure). Both are confirmed against LIVE, not inferred.

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

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements freeze | BLOCKED — awaiting owner rulings |
| 1 | Environment preflight | PARTIAL — DEF-001..005 raised |
| 2 | Catastrophic-risk tests | NOT STARTED |
| 3 | Core commercial journey | BLOCKED by DEF-001/002 |
| 4 | Module coverage | BLOCKED by DEF-001/002/003 |
| 5 | Non-functional readiness | NOT STARTED |
| 6 | Operational readiness | NOT STARTED |
| 7 | Security & deployment integrity | PARTIAL — DEF-004/005 raised |
| 8 | Cleanup verification | NOT STARTED |

## Blockers on the owner

UI-driven phases (2, 3, 4, 5) cannot start: the browser test environment reports
`signed_out`, so no authenticated Playwright session can be established. Sign in
to the preview once and the session injects on the next turn.

The six environment rulings raised previously (restore rehearsal, monitoring,
second tenant, staff/admin fixtures, multi-practice identity, performance seeding)
remain outstanding and gate Phase 0.
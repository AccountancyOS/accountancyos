# Sprint 1 — Completion Runbook (canonical engagement-letter lifecycle)

**For:** the owner (non-technical) + Lovable, to finish Sprint 1 with verification.
**Status as of 2026-06-24:** Increments 1, 2, 3a, **and 3b** are **done and on `main`** — all **dormant behind the per-org flag `organizations.canonical_lifecycle_enabled` (default FALSE)**, so they change nothing for any live client until a flag is switched on. The code for the canonical lifecycle is complete; what remains is (a) the human verification — enable ONE test org and walk the 5 scenarios, and (b) auto-activation, which is intentionally left because it needs a security-design decision (below), not because it's unfinished plumbing.

---

## What's already built (all flag-OFF / dormant)

- **Increment 1 — foundation.** Per-org flag + reader; idempotency unique-index backstops; `lifecycle_onboarding_gates()` (the gate evaluator); a dormant `lifecycle_evaluate_onboarding_activation()`; and a flag-gated guard on `lifecycle_approve_onboarding` (blocks approval unless gates pass — only when the flag is ON).
- **Increment 2 — pending funnel.** When the flag is ON, accepting a quote no longer activates the client (no active links/engagements/jobs/deadlines) — it leaves a *pending* shell; the gated **Approve** then activates and creates the practice↔client link. Flag OFF = behaves exactly as today.
- **Increment 3a — IDOR token threading.** Every public onboarding page action now carries a secret `access_token` end-to-end (quote-accept → `/onboard?token=…` → all onboarding RPCs → preserved across the Stripe round-trip via sessionStorage, NOT through Stripe → emailed resume link). The RPCs **validate the token if present** but still accept no-token (legacy) calls — so nothing is enforced yet, and no in-flight onboarding breaks.

**Net:** the app behaves exactly as before for every org. The new lifecycle is fully wired and one flag-flip away.

---

## STEP 1 — Enable ONE test practice and verify (Increment 5)

Do this on a **test/sandbox practice**, not a real client account.

> ### Prerequisite status (updated 2026-06-25 — most are now CLEARED)
> 1. ✅ **Reconcile the two lifecycle systems.** DONE — reconciliation Increments 1 & 2 (`20260624223826`, `20260625062413`) dropped the spine's activate-on-accept and left `canonical_lifecycle_enabled` as the single live switch (`canonical_spine_v1` is now inert). See `sprint1-lifecycle-reconciliation-plan.md`.
> 2. ✅ **Token enforcement no longer bricks pre-token onboardings.** Increment 1 made the onboarding guard *validate-if-present* (never hard-require), so turning the flag on is safe even with NULL tokens. (The `access_token` backfill is now only needed LATER, when re-introducing hard token enforcement — NOT to enable the gated model.)
> 3. **Confirm the token migrations are applied** (`validate_onboarding_access_token`, the 2-arg onboarding RPCs, `get_quote_by_token` returning `onboarding_access_token`). Re-assert any that are missing; don't trust the pending-list.
>
> **Net:** enabling the flag on a TEST org is now low-risk. Expect to surface a few flag-ON-only bugs (like the legacy path did) — fix-as-you-go. Emergency revert any time: `UPDATE public.organizations SET canonical_lifecycle_enabled = false WHERE canonical_lifecycle_enabled = true;`

**1a. Turn the flag on for the test org.** Ask Lovable:
> "Set `canonical_lifecycle_enabled = true` on the `organizations` row for `<test org name>` only."

**1b. Walk the five scenarios in the app and confirm each:**

| # | Do this | Expected (flag ON) |
|---|---|---|
| 1 | Send a quote to the test client and **accept** it via the public link | Client appears **pending** — **no jobs**, no active services, no practice↔client link yet. Lands on `/onboard/<id>?token=…` |
| 2 | Complete onboarding (sign EL, AML, billing), then **Approve** it | Client becomes **active**, engagements + jobs appear, portal access granted, and a practice↔client link exists |
| 3 | Try to **Approve** before onboarding is finished | Blocked with an "outstanding gates" message (EL not signed / AML not done / etc.) |
| 4 | Add a client via **Add Client** | Created as **pending** (a prospect), not active |
| 5 | Mark a CRM lead **Won** | Does NOT activate a client on its own |

**1c. If anything is wrong → roll back instantly:** ask Lovable to set `canonical_lifecycle_enabled = false` for that org. No redeploy, no data change — behaviour reverts immediately.

> Until Step 1 passes on a test org, **do not enable the flag for any real practice.**

---

## STEP 2 — Token enforcement (Increment 3b) — only after Step 1 passes

**3b is now IMPLEMENTED** (commit `21264a4`) — flag-gated, so dormant until you enable a test org. It adds `lifecycle_require_onboarding_token()` (flag ON → token required + valid; flag OFF → validate-if-present) and routes all 7 public onboarding RPCs through it. Bodies were reproduced byte-for-byte by a build script that asserted only the guard block changed.

**Verify on the test org (flag ON), after Step 1:**
- A fresh quote-accept → onboarding works end-to-end (token flows from the URL, then sessionStorage across Stripe).
- Opening `/onboard/<id>` **without** `?token=…` (and with no sessionStorage token) → blocked with "Onboarding access token required or invalid".
- A non-flagged org → unaffected (validate-if-present, old links still work).

---

## STEP 3 — Auto-activation (deferred increment) — optional, later

Today, a flag-ON client is activated when the **accountant clicks Approve** (the gated path — fully working and secure). The fuller vision is **auto-activation**: when a client finishes onboarding and all gates pass, `lifecycle_evaluate_onboarding_activation()` (already built, currently dormant) fires automatically — no accountant click — routing to the accountant only when a gate fails.

**This was deliberately NOT wired up, because it has a real design decision — not a quick wire-up:**
- `lifecycle_approve_onboarding` enforces `user_has_organization_access(org)` (it must — it's the accountant's privileged action).
- Auto-activation would fire from the **client's** onboarding-submit, which has **no org membership** → approve would reject it.
- The naive fix (a "skip access check" flag on approve) would be a **security hole**: approve is callable by authenticated users, so a bypass parameter would let anyone activate any application (privilege escalation / IDOR).
- The correct design is a **separate, non-exposed system-activation path** (a SECURITY DEFINER function NOT granted to anon/authenticated, callable only by the evaluator, that performs the activation without the per-user membership check because the *gates* are the authorization). That reuses the gate evaluation but needs the activation body factored out of approve — its own increment with its own review.

**Until then, the manual Approve path is complete, secure, and the recommended flow.** Auto-activation is a convenience, not a requirement.

---

## One-line rollback (any time, any reason)
`canonical_lifecycle_enabled = false` for the affected org → instant revert to legacy behaviour, no redeploy, no data change. The whole rollout is reversible per-practice.

---

## Quick reference — what guards this work
- `npx vitest run` (135 tests) — incl. `onboarding-token-threading.test.ts`, `vocabulary-drift.test.ts`.
- `bun smoke` — live drift check (cron/vault/constraints incl. `email_queue` context).
- All increment migrations are diff-verified verbatim reproductions + only the documented additions.

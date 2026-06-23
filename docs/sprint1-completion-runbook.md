# Sprint 1 — Completion Runbook (canonical engagement-letter lifecycle)

**For:** the owner (non-technical) + Lovable, to finish Sprint 1 with verification.
**Status as of 2026-06-23:** Increments 1, 2, and 3a are **done and on `main`** — all **dormant behind the per-org flag `organizations.canonical_lifecycle_enabled` (default FALSE)**, so they change nothing for any live client until a flag is switched on. The remaining steps (3b, enablement, auto-activation) need someone watching the live app, so they are intentionally NOT done yet.

---

## What's already built (all flag-OFF / dormant)

- **Increment 1 — foundation.** Per-org flag + reader; idempotency unique-index backstops; `lifecycle_onboarding_gates()` (the gate evaluator); a dormant `lifecycle_evaluate_onboarding_activation()`; and a flag-gated guard on `lifecycle_approve_onboarding` (blocks approval unless gates pass — only when the flag is ON).
- **Increment 2 — pending funnel.** When the flag is ON, accepting a quote no longer activates the client (no active links/engagements/jobs/deadlines) — it leaves a *pending* shell; the gated **Approve** then activates and creates the practice↔client link. Flag OFF = behaves exactly as today.
- **Increment 3a — IDOR token threading.** Every public onboarding page action now carries a secret `access_token` end-to-end (quote-accept → `/onboard?token=…` → all onboarding RPCs → preserved across the Stripe round-trip via sessionStorage, NOT through Stripe → emailed resume link). The RPCs **validate the token if present** but still accept no-token (legacy) calls — so nothing is enforced yet, and no in-flight onboarding breaks.

**Net:** the app behaves exactly as before for every org. The new lifecycle is fully wired and one flag-flip away.

---

## STEP 1 — Enable ONE test practice and verify (Increment 5)

Do this on a **test/sandbox practice**, not a real client account.

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

Right now the onboarding RPCs *accept* a token but don't *require* one (so old links still work). 3b makes the token **required** — closing the bare-UUID IDOR — but **only for orgs with the flag ON**, so it rolls out with the same test org.

**Implementation (a developer/Lovable does this; it's small and mechanical):**
1. Add a guard function `lifecycle_require_onboarding_token(p_application_id, p_access_token)` that: reads the application's org flag; if the flag is ON → reject when the token is missing **or** invalid; if OFF → keep today's "validate-if-present" behaviour.
2. In each of the 7 public onboarding RPCs (`public_get_onboarding`, `public_preview_engagement_letter`, `public_sign_engagement_letter`, `public_record_aml_upload`, `public_skip_billing`, `public_complete_billing`, `public_submit_onboarding_for_review`), replace the existing 4-line `IF p_access_token IS NOT NULL AND NOT validate… THEN RAISE` block with one line: `PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);`. Reproduce each body verbatim and change only that block (diff-verify).

**Verify (test org, flag ON):**
- A fresh quote-accept → onboarding works end-to-end (token flows from the URL).
- Opening `/onboard/<id>` **without** `?token=…` → blocked ("token required").
- A non-flagged org → unaffected (still validate-if-present).

**Why it wasn't done autonomously:** it edits 7 live client-facing RPCs, and a reproduction slip would break onboarding for *everyone* (the legacy path too). It must be diff-verified and watched on a test org — exactly the human-in-the-loop step. It provides zero benefit until a flag is flipped, so there's no cost to doing it carefully with you present.

---

## STEP 3 — Auto-activation (deferred increment) — optional, later

Today, a flag-ON client is activated when the **accountant clicks Approve** (the gated path). The fuller vision is **auto-activation**: when a client finishes onboarding and all gates pass, `lifecycle_evaluate_onboarding_activation()` (already built, currently dormant) fires automatically — no accountant click — and only routes to the accountant for review when a gate fails.

To enable: call the evaluator at the end of the onboarding-completion RPC (billing-complete / submit) for flag-ON orgs. This is its own increment with its own test pass, because it changes *when* activation happens. Leave it until Steps 1–2 are solid.

---

## One-line rollback (any time, any reason)
`canonical_lifecycle_enabled = false` for the affected org → instant revert to legacy behaviour, no redeploy, no data change. The whole rollout is reversible per-practice.

---

## Quick reference — what guards this work
- `npx vitest run` (135 tests) — incl. `onboarding-token-threading.test.ts`, `vocabulary-drift.test.ts`.
- `bun smoke` — live drift check (cron/vault/constraints incl. `email_queue` context).
- All increment migrations are diff-verified verbatim reproductions + only the documented additions.

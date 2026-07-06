# Sprint 1 — Canonical Engagement-Letter Lifecycle & Active-Client Bypass Removal — Implementation Plan

**Date:** 2026-06-17
**Status:** Reconnaissance complete; design decisions locked; awaiting verification-path decision before generating migrations against the live Supabase project.
**Scope:** Sprint 1 only — make the legal lifecycle canonical and remove active-client bypasses. Wider services/jobs/deadlines/rollover work is explicitly out of scope.

---

## 1. Key discovery — two activation engines, one already EL-aware

- **`public_accept_quote_by_token`** (`20260603200107`, latest accept RPC, anon) runs at **quote acceptance** and eagerly creates `accountant_client_links (status='active')`, `active` engagements, `blank` jobs, `pending` deadlines, marks the lead `won`, and creates the onboarding application. **No engagement-letter reference.** This is the bypass.
- **`lifecycle_approve_onboarding`** (`20260603180743`) runs at **accountant approval**, after the client completes onboarding (incl. EL signing). It activates client/company, creates engagements (idempotent on `quote_id+service_id`) and jobs (idempotent), grants portal access, and populates from questionnaire data. It is gated on `engagementSigned` in the UI (`OnboardingDetail.tsx:314`) but **does not re-check `signed_at` server-side.**

Both fire today, so the relationship goes active at acceptance — long before any EL is signed. The fix is therefore mostly **subtraction + server-side hardening**, not new activation logic.

---

## 2. Locked design decisions (from product owner)

| # | Decision | Choice |
|---|---|---|
| 1 | **Activation trigger** | **System-driven auto-activation** when all mandatory gates pass; accountant approval is the **exception path** for failed/judgement gates, not the default. |
| 2 | **EL signing consolidation** | **Onboarding flow is canonical**; emailed link lands on the onboarding signing step; retire the view-only `/engagement/:token`. |
| 3 | **Bypass scope** | **All ungated creation paths** (accept RPC, AddClient, Won, `convertLeadToClient(force)`, `EditClientDialog`, `DataImportStep` bulk). |
| 4 | **Onboarding IDOR** | **Add a signing-token now** — bare-application-UUID access to sign/read is closed this sprint. |

### 2.1 The auto-activation gate model (Decision 1, expanded)

A backend evaluator activates automatically **iff all mandatory gates pass**; otherwise it routes the application to `for_review` and surfaces it to the accountant. All gates are backed by **real, existing columns** (verified):

| Gate | Source of truth |
|---|---|
| Engagement letter signed | `engagement_letters.signed_at IS NOT NULL` for the application (and `onboarding_applications.contracts_signed_at`) |
| AML/KYC passed | `onboarding_applications.aml_status IN ('passed','verified')` |
| Billing complete where required | `onboarding_applications.billing_status` = paid/complete, or skipped via `public_skip_billing` |
| Required details submitted | onboarding reached the submitted state (`portal_pending`/`for_review`) |
| No blocking risk/review flags | `onboarding_applications.requires_review = false AND needs_review = false` |

**Flow (low-risk client):** accept → sign → AML + billing complete → evaluator finds all gates pass → **auto-activates** (links, engagements, jobs, deadlines, portal) and creates the work.
**Flow (exception):** any gate fails/needs judgement → status `for_review`, accountant dashboard shows exactly what is outstanding → accountant resolves and approves (same activation routine).

---

## 3. Canonical path after the change

**One activation routine**, invoked two ways:
- **Automatically** by `lifecycle_evaluate_onboarding_activation` (new) at the end of the client onboarding flow (billing-complete / submit step), when all gates pass.
- **Manually** by the accountant (exception path) via the hardened `lifecycle_approve_onboarding`, which now **enforces the signed-EL gate server-side** and re-uses the same activation body.

`public_accept_quote_by_token` is reduced to a **pending funnel**: mark quote accepted, mark lead pending, ensure onboarding application + minimal **pending** shell, issue the engagement letter. It creates **no** active links/engagements/jobs/deadlines.

---

## 4. Paths blocked / redirected / downgraded

| Path | Change |
|---|---|
| `public_accept_quote_by_token` | Strip all link/engagement/job/deadline creation; pending funnel + issue EL only |
| `lifecycle_approve_onboarding` | Add server-side signed-EL enforcement; remains the activation body (shared with auto-evaluator) |
| `convertLeadToClient(options.force)` | Remove the `force` bypass; gate server-side |
| `AddClientDialog` | Repurpose → "Create Prospect / Start Onboarding"; pending client only; no links/services/jobs/deadlines; status surfaced |
| `EditClientDialog`, `DataImportStep` (bulk) | Block creation of *active* clients; create as pending or route into onboarding |
| CRM "Won" | CRM stage flag only (no activation) — already the case; verified |

---

## 5. DB / RPC changes (additive, staged; no data loss)

1. **EL schema + immutability** — add `status` (`draft`/`sent`/`signed`), `signed_by`, `signer_name`, `signer_email`, `version`, and per-client linkage (`client_id`/`company_id`) to `engagement_letters`; backfill `status='signed'` where `signed_at IS NOT NULL`; **fix the broken `protect_engagement_letter_signatures` trigger** (currently references non-existent `status`/`signature_data`) to key immutability off `signed_at`.
2. **Onboarding signing-token (IDOR fix)** — add `access_token` (random secret) + expiry to `onboarding_applications`; backfill for live apps; require it in `public_get_onboarding` / `public_sign_engagement_letter` / `public_record_aml_upload` / billing / submit RPCs; thread it through the `/onboard` URL.
3. **Idempotency backstops** (none exist today) — dedup then add unique indexes: `engagements(quote_id, service_id)`, `accountant_client_links` (one active link per practice+entity), `jobs(generation_reason)`.
4. **Lifecycle rewrite** — strip activation from `public_accept_quote_by_token`; add `lifecycle_evaluate_onboarding_activation` (gate evaluator + auto-activate-or-route-to-review); harden `lifecycle_approve_onboarding` (server-side EL gate; shared activation body); give `engagement_letter_required` an operational consumer (mark changed service pending re-engagement).

## 6. Frontend / service changes

- `PublicQuoteView` — post-accept copy → "Please review and sign your engagement letter to continue"; flow into onboarding signing (token-aware).
- Consolidate signing onto the onboarding step; retire/redirect `/engagement/:token`; emailed link → onboarding signing surface.
- `EngagementLetterStatus.tsx` — fix to be **per-client** (currently shows a global latest-signed date for every client).
- `AddClientDialog` → prospect/pending UX; status badges on client/services.
- `lead-conversion-service.ts` — remove `force`; rely on the server gate.
- Wire `engagement-change-service.ts` (currently dead) so a fee/service change marks the service pending re-engagement.

## 7. Idempotency & security

- Activation is idempotent via the new unique indexes + lookup-before-insert (already present in `lifecycle_approve_onboarding`); repeated signing/approval/callbacks cannot duplicate links/engagements/jobs/deadlines/portal access.
- Public RPCs validate a random secret token (quote-acceptance token already exists and is validated; onboarding gains the new `access_token`); no bare-UUID activation/sign/read; RLS unchanged and not weakened.

## 8. Regression risks

- Removing accept-side creation makes activation the **sole** responsibility of the evaluator/approval — must guarantee the evaluator runs for every completed onboarding.
- Adding unique constraints can fail against legacy duplicate rows → dedup/backfill first.
- Quotes already accepted-but-not-approved under the old RPC already have active rows → need a one-off reconciliation decision (out of this plan; flag before applying).
- Token-threading must not break the Stripe billing / AML steps between signing and activation.

## 9. Verification plan

- **Frontend:** `npm run build` (TypeScript) + `npm run lint` — runnable here.
- **Migrations:** **cannot be executed in this environment** (no Supabase CLI / psql / local DB). Must be applied to the Supabase project via Lovable sync or `supabase db push`. Static review + the 5-scenario matrix below to be run against the project (sandbox/test org).
- **5-scenario matrix:** (1) public quote acceptance issues EL and creates **no** active rows; (2) completing all gates auto-activates with correct fees, idempotent on replay; (3) Add Client creates pending-only; (4) CRM "Won" does not activate; (5) fee/service change marks pending re-engagement.

## 10. Open question blocking migration generation

How should migrations be applied and verified, given there is no DB in this environment? Options: (a) I author the full migration set; you apply via Lovable/`supabase db push` and report errors so I iterate; (b) you provide a staging/sandbox project or DB connection for me to apply+verify; (c) implement increment-by-increment with you applying each migration before the next.

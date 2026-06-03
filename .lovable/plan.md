## Quote Acceptance → Client Onboarding — End-to-End Workflow

A big audit + build. To keep it shippable and reviewable I'll deliver in 4 phases. Each phase is independently testable and leaves the app in a working state. Total scope matches your 16-point spec exactly — nothing is dropped — but Phase 1 is the smallest unblocker (fixes the manual-create bug and the client-side post-accept dead end), and Phases 2–4 build the full multi-step onboarding journey on top of the existing `onboarding_applications` / `engagement_letters` / `onboarding_documents` / `kyc_documents` / `client_portal_users` tables already in the project.

### Lifecycle (single source of truth)

```text
Quote Sent
  → Quote Accepted              (public_accept_quote_by_token, today)
  → Lead Won                    (CRM stage advance, today — to verify)
  → Onboarding Created          (status: in_progress, today — to harden)
  → Engagement Letter Signed    (NEW client-facing step)
  → AML Documents Uploaded      (NEW client-facing step, auto-filed to Documents/AML)
  → Billing Setup Complete      (NEW client-facing step, Stripe Connect / subscription)
  → Portal Account Created      (NEW client-facing step)
  → For Review                  (NEW status; all client-side steps done)
  → Accountant Reviews          (review screen; verify AML, set up jobs/years/periods)
  → Complete                    (NEW status; client becomes active, recurring jobs go live)
```

`Needs Client Action` and `Rejected/Closed` are added as branches off `For Review`.

---

### Phase 1 — Fix the existing bugs and the dead end on the public quote page

Goal: stop the bleeding. This alone gives you a working hand-off from quote acceptance into the existing onboarding record.

1. **Fix the manual onboarding create error.** `onboarding_applications` has two competing CHECK constraints on `status`:
   - `chk_onboarding_applications_status` (NOT VALID) — allows `draft, sent, in_progress, contracts_signed, approved, rejected, cancelled`.
   - `onboarding_applications_status_check` (active) — allows `pending, in_progress, aml_review, approved, rejected`.
   `CreateOnboardingDialog.tsx` inserts `status: 'pending'`, which violates the first constraint as soon as it is validated. Migration will:
   - Drop both legacy constraints.
   - Add a single new `onboarding_applications_status_check` covering the full new lifecycle: `draft, in_progress, engagement_pending, aml_pending, billing_pending, portal_pending, for_review, needs_client_action, approved, rejected, cancelled`.
   - Backfill any rows still on legacy values.
2. **Harden `CreateOnboardingDialog`.** Validate required fields client-side (name/email at minimum, plus company name+number for `company` type), surface Postgres error messages clearly, and prevent the silent failure path.
3. **Add a "Continue Onboarding" handoff on the public quote page.** After `public_accept_quote_by_token` succeeds today the client just sees "your accountant will be in touch". Replace this with a CTA that routes to `/onboard/{onboarding_id}?token={...}` (new public route, see Phase 2). For Phase 1 the route renders a placeholder "Onboarding starting…" page so the link works end-to-end while Phase 2 builds the real wizard.
4. **Audit the existing CRM → Lead Won update.** Confirm `public_accept_quote_by_token` is updating `leads.status` / `crm_stage` on every accept (idempotent), and is logging an `activity` entry. Fix any gap, add a regression check via `audit_log` entries.
5. **Lock the accepted quote.** Add `accepted_snapshot jsonb` to `quotes` (full line-items, totals, billing frequency, valid_until, terms_version, accepted_by_name, accepted_ip) populated atomically inside `public_accept_quote_by_token`. Block UPDATE on quote_lines once `quotes.status = 'accepted'` via a trigger; allow only the accountant to "supersede" by creating a new draft quote.

Phase 1 deliverable: manual + auto onboarding records create cleanly, every quote acceptance produces an onboarding row, the locked quote snapshot is preserved, and the public quote page links the client into the next step.

---

### Phase 2 — Client-facing onboarding wizard

New route `/onboard/:applicationId` (public, token-gated), built as a 4-step wizard inside one shell so it feels continuous.

```text
Step 1: Engagement Letter
  - Auto-generate from accepted services (reuse existing engagement_letters table + EngagementLetterPreview)
  - Pull service schedules from quote_lines → services_catalog
  - In-browser scroll-to-sign (existing DocumentSignatureFlow)
  - Save signed PDF to documents bucket → folder "Engagement Letters"
  - Set onboarding_applications.contracts_signed_at + status = aml_pending

Step 2: AML Documents
  - Required docs derived from application_type (individual vs company) + service mix
  - Reuse kyc_documents + existing AML upload component
  - Auto-create "AML" folder under client documents if missing
  - Each upload writes a row to documents (linked to client) AND to onboarding_documents (linked to application) so files survive past onboarding
  - When all required types present → status = billing_pending

Step 3: Billing Setup
  - Build Stripe Checkout session from accepted_snapshot:
      - one-off subtotal → one-time line item
      - monthly subtotal → recurring subscription (interval: month)
      - VAT treatment from organisation_branding/practice settings
  - On Checkout success webhook (or return_url polling, per Option A+ Polling memory) → status = portal_pending
  - On abandon/decline → status stays billing_pending, accountant sees it stuck

Step 4: Portal Account
  - If client_portal_users row already exists for email → link, do not duplicate
  - Otherwise issue magic-link/sign-up to portal app domain (uses existing portal infrastructure)
  - On success → status = for_review, fire notification (Phase 3)
```

All step transitions go through one SECURITY DEFINER RPC `advance_onboarding_step(app_id, step, payload)` to guarantee idempotency: re-calling with the same step is a no-op; double-clicks, refreshes, and webhook retries cannot create duplicate clients/letters/folders/portal users.

Token gating: extend `quote_acceptance_tokens` model — on accept, mint an `onboarding_session_tokens` row tied to the application that the wizard uses for all reads/writes via a small set of `public_onboarding_*` RPCs (mirroring the existing public quote RPCs).

---

### Phase 3 — Accountant side: notifications + review screen

1. **Notification on `for_review`.** Trigger on `onboarding_applications` status change → inserts into the existing `notifications` table, addressed to the assigned accountant (resolved via lead owner → assigned_user → org owner fallback). If the practice has email connected, also queue an email via `email_queue` using a new `onboarding_for_review` system template.
2. **`/onboarding/:id` review screen rebuild.** Extend `OnboardingDetail.tsx` into a structured review with these collapsible sections:
   - Commercial — pulls from `accepted_snapshot`
   - Engagement Letter — preview + download signed PDF, signer + timestamp
   - AML — list of uploaded docs with Verify / Reject (notes) buttons (writes to `kyc_documents.verification_status`)
   - Billing — Stripe subscription status, first invoice/payment status
   - Portal — account status, email, linked client
   - **Client Setup Checklist** (new component `OnboardingReviewChecklist`) — interactive checklist that the accountant must complete before "Mark Complete" unlocks. Items pulled from accepted services:
     - Year end / accounts production period
     - Companies House number, UTR, VAT scheme + periods, PAYE scheme + periods, SA years, bookkeeping start date, CT period
     - Recurring jobs created (links to job-template engine to spawn)
     - Filing deadlines auto-generated (links to deadlines engine)
     - Assigned accountant / client manager
     - Tags / service package
3. **Actions on the review screen:**
   - "Send back to client" → status = `needs_client_action`, with a note; client gets emailed a fresh wizard link to the failing step
   - "Reject" → status = `rejected`, reason required, quote remains accepted but no client/company gets activated
   - "Mark Complete" → status = `approved`, runs `lifecycle_complete_onboarding(app_id)` RPC

`lifecycle_complete_onboarding` is the single place that flips the client/company from "Onboarding" to active, activates the recurring jobs and deadlines that were drafted in the checklist, writes the engagement letter + AML docs into the permanent client document area (idempotent: skips if already there), and writes the final audit entries.

---

### Phase 4 — Idempotency, audit, and regression

1. **Idempotency sweep.** Every RPC in the new flow (accept quote, advance step, complete onboarding) wrapped in `SELECT ... FOR UPDATE` on the application row; status transitions enforced by a trigger so out-of-order calls fail loudly.
2. **Duplicate guards.**
   - Clients: lookup by `(organization_id, lower(email))` before insert (extends existing `public_accept_quote_by_token` logic).
   - Companies: lookup by `(organization_id, company_number)` then by name fallback.
   - Engagement letters: unique on `(onboarding_application_id, version)`.
   - Portal users: unique on `(client_id, email)`.
   - AML folders: idempotent `ensure_client_document_folder(client_id, 'AML')` helper.
3. **Audit trail.** Single `onboarding_events` log table (or extend `audit_log` with a typed metadata schema) capturing every named event in your spec §14. Surfaced as a timeline on the accountant review screen.
4. **Regression coverage.**
   - Smoke script: create lead → quote → accept → walk all 4 wizard steps → review → complete. Verify no duplicate clients/jobs/letters/portal users; verify quote stays locked; verify deadlines materialise.
   - Re-run script with refresh/double-click at each step.
   - Manual create path: individual, company, CRM-converted, accountant-direct.

---

### Technical notes

- All new tables/columns get explicit `GRANT` + `RLS` blocks; `for_review` notifications and review actions all scope to `organization_id` via the existing `user_has_organization_access` helper.
- Stripe billing uses the existing Stripe Connect practice billing infrastructure (per `mem://architecture/stripe-connect-client-billing`) so the practice receives funds, not the platform.
- Portal account creation uses the existing dual-project portal architecture; we issue an invite, the portal sign-up lives in the portal app.
- No parallel onboarding system: every new piece extends `onboarding_applications`, `engagement_letters`, `kyc_documents`, `documents`, `client_portal_users`, `notifications`, `email_queue`, `audit_log`.
- The `accepted_snapshot` on `quotes` is the immutable commercial record referenced by billing, engagement letter, jobs, and review.

### What I need from you to start Phase 1

Quick confirmations only — none should block:

1. OK to drop the legacy `chk_onboarding_applications_status` (NOT VALID) constraint as part of the fix? It's not enforced today and is the root of the manual-create bug.
2. For the public onboarding wizard route: `/onboard/:applicationId` on the accountant app domain is the simplest. Confirm OK, vs. hosting it on the client portal domain.
3. Phase 2 billing step assumes Stripe Connect is already configured for the practice. If a practice has no Stripe connected, the wizard should skip billing and mark the step "Awaiting practice billing setup" rather than block. Confirm.

If all three are "yes", I'll start Phase 1 as soon as you flip me into build mode.

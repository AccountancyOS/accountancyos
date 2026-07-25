# Proposal — Phase 2: Contacts, signatories, split activation & billing method — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Grounding: spec `docs/superpowers/specs/2026-07-25-proposal-scope-periods-signatories-design.md`; discovery `docs/superpowers/plans/2026-07-25-proposal-discovery-report.md`.

**Goal:** Directors→signatories on a proposal; an all-must-sign (default) / any-one-may-sign rule; **live services & jobs created only after the signature rule is satisfied**; activation idempotent and **decoupled from billing** (Stripe or externally-managed, chosen per client/proposal). Reuse existing engagement-letter, CH-officer, activation and gate machinery — no parallel systems.

**Global constraints (resolved spec decisions):**
- Commit to the **canonical activation path**; neutralise legacy accept-time job creation.
- **Split** `lifecycle_onboarding_gates`: signature-rule completion → activation; `billing_settled` → separate, non-blocking onboarding step. Do NOT fork a parallel activation system.
- Billing **method** per client/proposal + org default; reuse existing `billing_status` enum values (`skipped`/`not_required`) — no generic boolean, no new payment journey, no Stripe rewrite (webhook only if polling proves insufficient).
- Proposal stores its **own signatory snapshot** (immutable in-flight).
- Every DB task = one small additive migration, based on the LIVE function body (RPC-replacement discipline), receipt-verified, owner-applied.

---

### Task 2a (FOUNDATION, additive): signatories model + signing rule + status
**Files:** migration `…_engagement_letter_signatories.sql`; test; receipt.
**Produces:**
- `engagement_letter_signatories` (id, organization_id, engagement_letter_id FK, onboarding_application_id, person_id/contact_id nullable, signer_name, signer_email NOT NULL, signature_token, signed_at, signature_ip, signature_user_agent, required boolean default true, sign_order int, created_at) + RLS mirroring `engagement_letters`, + immutability trigger on signed rows (reuse `protect_engagement_letter_signatures` pattern).
- `engagement_letters.signing_rule text NOT NULL DEFAULT 'all'` (CHECK in `'all','any'`).
- Add `'partially_signed'` to the relevant status vocabulary (proposal/quote status + `db-constants/check-constraints.ts`) — additive; keep existing values.
- Do NOT change signing RPCs yet (Task 2d).
Additive/idempotent; no behaviour change until 2d/2e populate it.

### Task 2b (LOAD-BEARING, careful): split the onboarding gate
**Files:** migration `…_split_onboarding_gate.sql`; test; receipt. **Bring a 1-paragraph note before dispatching — this re-issues live gate functions.**
- Fetch LIVE `lifecycle_onboarding_gates` + `lifecycle_approve_onboarding` (+ `lifecycle_evaluate_onboarding_activation`). Base CREATE OR REPLACE on live bodies verbatim.
- Change: activation gate = `engagement_letter_signed` (→ signature-rule satisfied over `engagement_letter_signatories`) + AML + submitted + not-closed + context — **remove `billing_settled` from the activation gate**. Expose `billing_settled` as a separate reported step that does NOT block activation.
- Keep idempotency (snapshot short-circuit, tokens.used_at). Do not fork; extend the existing functions.

### Task 2c (additive): billing method + external-billed producer
**Files:** migration `…_billing_method.sql`; UI. 
- Store billing method on the proposal/client (reuse `billing_status` vocabulary; add a `billing_method` only if no equivalent exists — verify live first; org default via `org_settings`). External-billed → an RPC/path that sets `onboarding_applications.billing_status='not_required'` and advances the step (mirror `public_skip_billing`), bypassing `onboarding-stripe-checkout` (which hard-throws without Connect). Stripe path unchanged except positive-only (already done in Phase 1 T2). Audited billing-method-change action (Stripe→external): cancel pending Stripe safely, don't touch scope/jobs.
- Validation: block Stripe selection when practice has no Connect setup (spec §Validation).

### Task 2d: consolidate signing + rule evaluation + gated activation
**Files:** migration (signing RPCs) + wiring.
- Consolidate the two divergent EL sign RPCs (`public_sign_engagement_letter` vs `_by_token` — the latter omits `contracts_signed_at`) into one that records a per-signatory signature on `engagement_letter_signatories` and evaluates `signing_rule`: `'all'` → `partially_signed` until every `required` signatory signed; `'any'` → first valid signature satisfies. On satisfied → set the gate's signature condition + trigger canonical activation (idempotent). Neutralise legacy accept-time job creation in `public_accept_quote_by_token` (it already no-ops under canonical; ensure canonical is the path).

### Task 2e (UI): signatory selection + billing-method step
**Files:** proposal dialog(s).
- Ltd: show active CH directors (reuse `onboarding-fetch-ch-officers`/`company_officers.is_signatory`); select 1+ signatories, one primary contact, email each; pick `all`/`any-one`; allow manual signatory; don't auto-add resigned; preserve manual emails on refresh; snapshot into the proposal. SA: linked individual as signatory. Billing-method selector (Stripe vs external) with org default. Review screen shows signatories + rule + billing method.

---
## Sequence & risk
T2a first (additive foundation). T2b is load-bearing (live gate re-issue) — note to owner first, verify live bodies. T2c/T2d/T2e follow. Reuse `engagement_letters`, CH-officer import, `is_signatory`/`can_sign`, `billing_status` enum, canonical gate — no parallel models. Highest risks: gate re-issue (2b), signing-RPC consolidation (2d), duplicate activation — all mitigated by live-body-based re-issue + idempotency keys + `db-constants` vocabulary updates (vocabulary-drift guard).

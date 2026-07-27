# Task 2b — split the onboarding activation gate: design note (for owner review)

**Status:** Design per the approved spec's resolved decisions #1 + #9. Built autonomously overnight as a committed-but-UNAPPLIED migration — **review before applying** (it changes activation gating).

## What the spec requires
- **Signature-rule completion controls activation** (services, jobs, deadlines, automations).
- **`billing_settled` is decoupled** into a separate, non-blocking onboarding step — Stripe failure/incomplete billing must NOT block or reverse the accepted engagement or live work.
- **Extend/split the existing gate; do NOT fork a parallel activation system.**

## Current live behaviour (Phase-0 discovery)
`lifecycle_onboarding_gates` returns `all_pass` iff **engagement_letter_signed AND aml_passed AND billing_settled AND onboarding_submitted AND not_already_closed AND activation_context_present**. `lifecycle_approve_onboarding` (canonical) refuses when `all_pass` is false, and `lifecycle_evaluate_onboarding_activation` auto-approves when all gates pass. So today **billing blocks activation** — the exact coupling the spec removes.

## The change (minimal, non-forking)
Re-issue `lifecycle_onboarding_gates` from its LIVE body, splitting its result:
- `activation_ready` = engagement_letter_signed **(now: signature-rule satisfied over `engagement_letter_signatories` per `engagement_letters.signing_rule`)** AND aml_passed AND onboarding_submitted AND not_already_closed AND activation_context_present. **`billing_settled` removed from this set.**
- `billing_settled` kept as a separate reported field (unchanged computation) for the billing step — informational, non-blocking.
- Keep `all_pass` for backward-compat but have `lifecycle_approve_onboarding` / `lifecycle_evaluate_onboarding_activation` gate on **`activation_ready`**, not `all_pass`. Billing remains its own onboarding step that completes independently (Stripe confirmation, or externally-managed → `not_required`).

## Signature-rule satisfaction (depends on Task 2a)
`engagement_letter_signed` becomes: for the letter's `signing_rule` — `'all'` → every `required` row in `engagement_letter_signatories` has `signed_at`; `'any'` → at least one `required` row signed. Falls back to the legacy single-`signed_at`/`contracts_signed_at` check when no signatory rows exist (backward-compat for in-flight letters).

## Why it's safe to build now / risks for review
- **Additive/decoupling only** — it never makes activation *stricter*; it removes billing as a blocker (loosening) and swaps the signature check for the richer signatory-rule (with a legacy fallback), so existing signed-single-signer onboardings still pass.
- **Idempotency preserved** — snapshot short-circuit + `tokens.used_at` untouched.
- **Risks to check before applying:** (1) any caller relying on `all_pass` *including* billing to gate activation — grep confirms `lifecycle_approve_onboarding`/`evaluate` are the gate consumers; (2) that re-issue is byte-based on the LIVE body (RPC-replacement discipline) — if the connector was down when built, the migration header will say so and you must diff live first; (3) confirm no other flow requires billing-before-activation for a business reason.

## Apply order
2a (signatories table) must be applied **before** 2b (the gate reads `engagement_letter_signatories` / `signing_rule`).

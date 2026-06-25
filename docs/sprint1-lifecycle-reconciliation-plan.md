# Lifecycle Reconciliation Plan (two canonical systems → one gated model)

**Decision (owner, 2026-06-24):** a client's services/jobs/deadlines go live **only after onboarding is complete and the accountant approves** — the Sprint 1 *gated* model. Lovable's activate-on-accept is retired.

## The two systems today
| | Yours (Sprint 1) | Lovable's "canonical spine" |
|---|---|---|
| Flag | `organizations.canonical_lifecycle_enabled` (**OFF**) | `org_settings.canonical_spine_v1` (**ON**) |
| Fires on | accept → *pending*; approve → activate | **accept → activate immediately** |
| Engine | `lifecycle_approve_onboarding` creates engagements/jobs keyed on `service_id` | `lifecycle_activate_client_services` creates engagements keyed on `canonical_service_code`; + `lifecycle_generate_jobs_for_service` + deadline generation |
| Strength | the **gate** (pending funnel, onboarding gates, token security, hardened approval) | the **engine** (catalogue-driven service→job→deadline materialisation) |

**Collision:** both create engagements/jobs (different keys ⇒ duplicates if both run). Two flags govern overlapping behaviour.

## Target architecture
- **One flag** governs the canonical lifecycle per org.
- **Accept → pending** (no links/engagements/jobs/deadlines).
- **Client onboards** (gated: EL signed, AML, billing), access-token secured.
- **Approve → activate ONCE**, via a single engine that produces client + link + engagements + jobs + deadlines + portal access.
- **No activation on accept.**

**Engine choice (REVISED after reading the code):** keep **`lifecycle_approve_onboarding`'s own engine**. Reading the functions showed approve already creates client + engagements + jobs + portal access at approval, *flag-independently*, and its `service_id` model fits the gated flow where the client is created late (at approval). The spine engine resolves its client via `leads.converted_client_id`, which is NOT set in the gated flow — so the spine **cannot** be the approval engine without re-plumbing lead conversion. Net: no engine swap. approve stays the single activation engine; the spine's accept-side trigger is simply removed. (The spine functions are left in place, unused, so this is reversible.)

## STATUS (2026-06-25): core reconciliation COMPLETE
Increments 1 & 2 are applied. Together they resolved the conflict:
- **No double activation** — the spine's accept trigger is dropped; `lifecycle_activate_client_services` and the deadline trigger are now **inert** (every remaining caller is inside a trigger that no longer fires, or only acts on `canonical_spine_v1` jobs which nothing creates). So `canonical_spine_v1` drives nothing live; no flag-consolidation needed.
- **No token landmine** — enabling `canonical_lifecycle_enabled` no longer hard-requires a token.
- **`canonical_lifecycle_enabled` is now the single meaningful switch.** With it ON: accept → pending, gates enforced at approve, link created, approve materialises engagements/jobs (its own engine). With it OFF: legacy path (today).

**Remaining = enablement + verification, not more reconciliation code:** turn the flag on for the test org, walk the 5 scenarios, fix any flag-ON bugs (as we did for the legacy path), then reintroduce token enforcement after the backfill.

## Phased increments (each: one small migration → Lovable applies + confirms → owner verifies in-app)
1. ✅ **Decouple token enforcement from the funnel** — `20260624223826`. `lifecycle_require_onboarding_token` now validate-if-present only; enabling the lifecycle flag no longer bricks pre-token onboardings.
2. ✅ **Disable activate-on-accept** — `20260625062413`. Dropped `trg_quote_accepted_activate_canonical`; accept leaves a pending shell, approve is the single activation point. (No engine swap — see Engine choice above.)
3. **Backfill `access_token`** on all open `onboarding_applications` (NULL tokens can never validate); confirm the accept→onboarding flow sets one for new rows. (Lovable data op.)
4. **Make approve's link creation flag-independent (or consolidate flags).** `lifecycle_approve_onboarding` only creates the `accountant_client_links` row when `canonical_lifecycle_enabled` is ON (lines ~320–336). For the gated model to fully work with the flag off, either un-gate the link creation or fold the two flags into one canonical-lifecycle switch (make `is_canonical_lifecycle_enabled` and `_canonical_spine_enabled` read one column).
5. **(Optional) Enrich approve with deadlines.** approve creates jobs but not deadlines; the spine's deadline generation could be invoked per job if/when wanted. Not required for the gated model.
6. **Enable on ONE test org + verify** the 5 scenarios (see `sprint1-completion-runbook.md`), then reintroduce token enforcement (post-backfill).

## Hard constraints (why this is staged, not one shot)
- These functions (`lifecycle_approve_onboarding`, the spine, the triggers) are **actively rewritten by Lovable** and partly **live-only / not in git** — each change must be reproduced against the *current* version and coordinated, not pasted blind.
- **Migrations apply to the live DB unreliably** (apply-gap) — every step is "apply + confirm none failed," and prefer changes that don't depend on a fragile second migration.
- **Keep both flags in their current safe state** (`canonical_lifecycle_enabled` OFF) until steps 1–5 are done and verified on a test org. Emergency revert: `UPDATE organizations SET canonical_lifecycle_enabled = false`.

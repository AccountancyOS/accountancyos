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

**Engine choice:** consolidate onto **Lovable's spine** (`lifecycle_activate_client_services` + job/deadline generation) as the activation engine, because it is the more complete, catalogue-driven materialisation (it already does deadlines, which approve does not). `lifecycle_approve_onboarding` becomes the **gate + caller**: it validates gates, creates the client/company + portal access + link, then calls the spine engine instead of doing its own `service_id` engagement creation.

## Phased increments (each: one small migration → Lovable applies + confirms → owner verifies in-app)
1. **Decouple token enforcement from the funnel.** Make the pending-funnel / gated-approve behaviour usable without *requiring* a token (validate-if-present only), so enabling the gated model can't brick pre-token onboardings. (Removes the cause of the earlier "token required or invalid" outage.)
2. **Backfill `access_token`** on all open `onboarding_applications` (NULL tokens can never validate); confirm the accept→onboarding flow sets one for new rows.
3. **Single engine at approve.** Replace `lifecycle_approve_onboarding`'s own `service_id` engagement/job block with a call to `lifecycle_activate_client_services(quote_id)` + job/deadline generation. Verify no duplicate engagements.
4. **Disable activate-on-accept.** Drop/disable the `tg_quote_accepted_activate_canonical` trigger so accept produces only a pending shell.
5. **Consolidate the flags** into one canonical-lifecycle switch (one column; make both `is_canonical_lifecycle_enabled` and `_canonical_spine_enabled` read it).
6. **Enable on ONE test org + verify** the 5 scenarios (see `sprint1-completion-runbook.md`).

## Hard constraints (why this is staged, not one shot)
- These functions (`lifecycle_approve_onboarding`, the spine, the triggers) are **actively rewritten by Lovable** and partly **live-only / not in git** — each change must be reproduced against the *current* version and coordinated, not pasted blind.
- **Migrations apply to the live DB unreliably** (apply-gap) — every step is "apply + confirm none failed," and prefer changes that don't depend on a fragile second migration.
- **Keep both flags in their current safe state** (`canonical_lifecycle_enabled` OFF) until steps 1–5 are done and verified on a test org. Emergency revert: `UPDATE organizations SET canonical_lifecycle_enabled = false`.

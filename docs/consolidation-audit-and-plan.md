# AccountancyOS — Duplicate-Engine Audit & Consolidation Plan

**Mandate:** one canonical implementation per business process. Sole developer = this agent; Lovable = hosting/deploy/migration-execution only.

**Method:** 5 parallel read-only audits across 23 domains (2026-06-29). Findings below are distilled; cite the named functions/files for the detail.

---

## 1. Duplicate-engine inventory (the problems)

| # | Domain | Duplicate implementations found | Canonical-to-be | Verdict |
|---|---|---|---|---|
| 1 | **Quote acceptance** | `public_accept_quote_by_token` — ~19 migration versions; latest `20260625070935`. Creates client/company/links/engagements/jobs/deadlines when flag OFF; skips when ON. | latest version only | consolidate + prune old migrations |
| 2 | **Onboarding approval** | `lifecycle_approve_onboarding` — latest `20260624080129`; ALSO creates client/company/links/engagements/jobs (crude, no deadline). 4+ old versions. | latest version only | consolidate |
| 3 | **Client/company creation** | TWO paths (accept + approve) create them independently, different lookup keys (lead.email vs onboarding.email) → duplicate-client risk | accept creates pending shell; approve only *uses* the ids | consolidate |
| 4 | **Client activation** | only `lifecycle_approve_onboarding` sets status=active | keep | OK |
| 5 | **accountant_client_links** | **opposite flag logic**: accept inserts when flag OFF; approve inserts when flag ON | one place (approve), idempotent | **critical** |
| 6 | **Engagements/services** | legacy inline (accept + approve, keyed quote_id+service_id) AND canonical spine `lifecycle_activate_client_services` (keyed canonical_service_code) — **different dedupe keys → double-create under flag ON** | one engine | **critical** |
| 7 | **Two lifecycle flags** | `organizations.canonical_lifecycle_enabled` AND `org_settings.canonical_spine_v1` — different tables, not synced, both gate overlapping logic | ONE flag | **critical** |
| 8 | **Job creation** | `CreateJobDialog` (direct INSERT, no idempotency), `job-template-engine.ts`, `lifecycle_approve_onboarding`, `lifecycle_generate_jobs_for_service` (spine) — 4 paths, divergent period formats ("2026/27" vs "2026") | ONE engine | **critical (the visible duplicate-job bug)** |
| 9 | **Job status** | `job-status-service.ts` + DB trigger `job_status_transition_check` | keep | OK |
| 10 | **Rollover** | `auto-rollover-service.ts` (canonical) + `cosec-filing-service.ts` (duplicate CS01) | one path | consolidate |
| 11 | **Deadline calculation** | `calculate_deadline()` PL/pgSQL, `deadline-engine.ts` (6+ hardcoded generators), `canonical_deadline_rules` (correct), `auto-rollover` hardcoded — **6+ calculators** | `canonical_deadline_rules` | **critical** |
| 12 | **Deadline creation** | 10+ INSERT sites (deadline-engine per service, manual dialog, onboarding RPC, spine RPC, rollover) | one engine | **critical** |
| 13 | **Deadline editing** | no real edit workflow (risk_score only) | build canonical edit | gap |
| 14/15 | **Deadline display** | accountant `Deadlines.tsx` + portal `portalDeadlinesService` BOTH read the `deadlines` table | keep (portal = projection) | OK |
| 16 | **Questionnaires** | RPCs canonical; UI dialogs duplicated (`SendQuestionnaireDialog` vs `SendOnboardingQuestionnaireDialog`) | merge dialogs | minor |
| 17 | **Workpapers** | **TWO tables**: `workpaper_instances` (JSONB) + `job_workpaper_instances` (file) — no 1:1 | one model | **critical** |
| 18 | **Documents** | `job_documents` has `client_visible`; `questionnaire_files` + `onboarding_documents` have NO visibility flag (implicitly client-visible) | add flag | risk |
| 19 | **Email** | PGMQ + `email_queue` split; `send-engagement-letter` bypasses queue (direct send); 4 template renderers; status constraint missing `'queued'` | one queue+sender, one renderer | **critical** |
| 20 | **Portal auth** | `portal_has_perm()` x3 versions; legacy `has_portal_role()` lingering | latest only | consolidate |
| 21 | **Billing/fees** | quote fees do NOT propagate to billing (no path found) | design later | gap |
| 22 | **CRM lead→client** | 3 paths (`convertLeadToClient` TS w/ EL gate; `port_quote_to_client` no gate; accept/approve) — inconsistent EL gate + converted_at | one path | **critical** |
| 23 | **HMRC/CH filing** | all stubs; filings store figures without `approved_model_version_id` (violates CLAUDE.md spec) | architect later | known gap |

---

## 2. Canonical ownership map (the target)

| Business domain | Canonical owner (single source of truth) | Deprecate / route through it |
|---|---|---|
| Lifecycle flag | **one** `canonical_lifecycle_enabled` (organizations); `_canonical_spine_enabled` reads it | retire `org_settings.canonical_spine_v1` as a separate switch |
| Quote acceptance | `public_accept_quote_by_token` (latest) → pending shell + onboarding app only | its inline job/engagement/link/deadline creation |
| Onboarding approval | `lifecycle_approve_onboarding` (latest) → activate + call the job/deadline engine | its crude inline job creation |
| **Job + deadline engine** | **NEW** `lifecycle_materialize_jobs(org, client, company, quote, source)` — idempotent; computes period + deadlines via `canonical_deadline_rules` | accept inline, approve inline, `CreateJobDialog` INSERT, `lifecycle_generate_jobs_for_service`, `deadline-engine.ts`, `auto-rollover` hardcoded deadlines |
| Manual Add Job | calls the same engine via an RPC | `CreateJobDialog` direct INSERT |
| Deadline calculation | `calculate_deadline()` backed by `canonical_deadline_rules` (one function, one rules table) | all hardcoded TS/SQL calculators |
| Rollover | `executeAutoRollover` → calls the engine for next period | `cosec-filing-service` CS01 rollover |
| Email queue + send | `email_queue` → `process-email-queue` (everything, incl. engagement letters) | direct mailbox sends; PGMQ (or formally separate) |
| Template render/merge | one renderer at compose-time | the 4 divergent renderers |
| Portal access | `getPortalUserContext` + `portal_access` + `portal_has_perm` (latest) | `has_portal_role`, old `portal_has_perm` versions |
| Lead→client conversion | one path with the EL gate + `converted_at` | the 3 divergent paths |
| Shared objects (jobs/deadlines/docs/etc.) | the canonical tables; portal = permissioned projection (mostly already true) | — |

---

## 3. Consolidation roadmap (execution order)

**P1 — Lifecycle + Job/Deadline engine (the visible bug + the worst duplication).**
1. Build the **one idempotent `lifecycle_materialize_jobs` engine** (period + deadlines via canonical rules).
2. Route `lifecycle_approve_onboarding` through it (remove crude inline job); make activation idempotent (link/engagement/job/deadline).
3. Make `public_accept_quote_by_token` create only the pending shell + onboarding app (no active jobs) — preserving flag-OFF behaviour via the same engine where it must still create.
4. **Unify the two flags.**
5. DB idempotency constraints (one active link per practice↔entity; one job per org+entity+service+period).

**P2 — Manual Add Job** → same engine; pre-select client; SA single/multi tax-year.
**P3 — Deadline engine** → route all deadline creation through canonical rules; editable; portal visibility.
**P4 — Rollover on completion** (SA: complete 2025/26 → create 2026/27, idempotent).
**P5 — Email** → engagement letter + all producers through `email_queue`; one renderer; fix status constraint.
**P6 — Portal/accountant consistency** → confirm projections; merge `portal_has_perm`; messages visibility.
**Cross-cutting:** prune duplicate migration versions; tests per domain (Phase 6 of the brief).

**Constraints honoured:** no second new system; flag-OFF behaviour preserved; RLS/tenant isolation preserved; no broad destructive migrations (handle existing dupes before constraints); idempotency everywhere.

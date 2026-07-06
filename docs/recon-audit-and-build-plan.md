# AccountancyOS — Reconnaissance Audit & Ordered Build Plan

**Date:** 2026-06-17
**Status:** Reconnaissance complete. No code changes proposed in this document — this is the pre-implementation audit required by `docs/accountancyos-project-reference.md` ("Required Output From Claude Before Coding").
**Scope:** Full operating-model spine (`Lead → Quote → Engagement Letter → Onboarding → Portal → Services → Jobs → Questionnaires → Records → Workpapers → Review → Approval → Filing → Completion → Rollover`) plus the filing-engine architecture in `docs/accountancyos-filing-engine-spec-v2.md`.

> **Method:** Audit conducted against the **current code** (migrations, edge functions, services, components) as of this date — not the February 2026 `docs/adversarial-audit-results.md`, which is ~4 months stale and predates the Phase 4/5 and April–June migration work. Where this audit corrects that document, it is noted.

---

## 1. Headline: how current state differs from the February audit

Several February "critical" findings are **already resolved** in current migrations and should no longer be treated as open:

| February finding | Current state | Evidence |
|---|---|---|
| `ORG_001` any user can join any org | **FIXED** — membership writes only via owner-only SECURITY DEFINER RPCs; direct insert blocked `WITH CHECK (false)` | `20260218184412`, `20260407104059` |
| `ORG_002` manager/viewer blocked by CHECK | **By design now** — migrated to a 3-role model (owner/admin/staff) | `20260407104059` |
| `RLS_001` direct journal insert bypasses posting service | **FIXED** — all journal/ledger write policies dropped; only `post_to_ledger` writes | `20260218184412`, `20260218190158` |
| Dual CT engines + hardcoded rates | **Substantially resolved** — one CT engine, one SA engine; rates load from `ct_rate_tables`/`sa_rate_tables`/`ca_rate_tables`; hardcoding demoted to an unreachable fallback | `ct-computation-engine.ts`, `tax-calculation-engine.ts`, `20251214192059`, `20260217125343` |
| Automation stop-conditions wrong ("records_received" for everything) | **Fixed in the new event-driven engine**; legacy `chaser-tick` path still latent | `process-automation-events/index.ts`, `chaser-tick/index.ts` |

The codebase is further along than the stale document implied. The real problem is different and deeper.

---

## 2. The dominant pattern: "built but not wired"

The single most important structural finding. Across nearly every subsystem the **correct table / RPC / service already exists**, but the **live path bypasses it**, **nothing calls it**, or a **parallel implementation diverges from it.** This recurs everywhere:

- The immutable, hash-sealed filing spine (`filing_model_snapshots`) is built and well-served by `filing-snapshot-service.ts` — but live CT/CH submission projects from *separate mutable* tables (`ct_computation_snapshots`, `accounts_model_snapshots`), and `filings.model_snapshot_id` is **nullable with no DB constraint**.
- `process_questionnaire_submission` (advances job, merges workpaper, stops chasers, notifies) has **zero callers**; the live submit (`submit_questionnaire_by_token`) only flips a status.
- The engagement-letter-on-change trigger sets `engagements.engagement_letter_required = true` but **nothing consumes the flag**.
- Rollover scaffolding columns exist throughout; **no execution logic** exists anywhere.
- **Two deadline engines** — DB `calculate_deadline()` and `src/lib/deadline-engine.ts` (JS) — that **already disagree** (VAT).
- The service-catalogue seed codes (`CT600`, `VAT-RETURN`…) **don't match** the engine codes (`corporation_tax`, `vat_return`…), so a fresh org's accepted quotes generate **no jobs/deadlines at all**.
- Concurrent-session enforcement queries `user_sessions`, which **nothing ever populates**.

**Consequence for the plan:** finishing AccountancyOS is primarily a **consolidation, wiring, and enforcement** program, not a feature-build. The expensive machinery is often already present; the remaining work is connecting live paths, collapsing duplicates to a single implementation, and giving invariants **DB-level teeth** plus tests that prove they can't be bypassed.

---

## 3. Most serious single finding — engagement-letter legal bypass

**Quote acceptance activates the client relationship, engagements, jobs and deadlines *before any engagement letter is issued or signed.***

- `public_accept_quote_by_token` (`20260603200107`) creates the company/client, sets `accountant_client_links.status='active'`, creates active engagements, jobs and deadlines on acceptance — with **no reference to `engagement_letters.signed_at`** and no DB guard.
- The emailed "sign" link `/engagement/:token` (`EngagementLetterPreview.tsx`) is **view-only** — clients cannot actually sign there; real signing exists only in the onboarding wizard.
- There are **five client-creation paths** with inconsistent gating; `AddClientDialog.tsx` creates a client entirely outside CRM/EL flow.
- The EL tamper-protection trigger (`20260218184412`) references `status`/`signature_data` columns **that don't exist** on `engagement_letters`.

For a product sold to regulated practices, doing client work before a signed engagement letter is direct **regulatory/legal exposure**, and the exact inverse of the brief's Phase 3.6 and Non-negotiables 4 & 8. **Recommended as a standalone hotfix ahead of all other work.**

---

## 4. Capability audit by subsystem

Status legend: **WORKS** / **MIS-WIRED** (exists but bypassed or disconnected) / **UI-ONLY** / **MISSING** / **UNSAFE**.

### 4.1 Security, session, RLS, tenant isolation (Phase 1)
- **WORKS:** org-membership isolation (post-fix), RLS helper functions (search_path pinned), journal write-path lockdown, storage bucket org-scoping, audit-log immutability/tamper-resistance (main + bookkeeping), OAuth token masking via `connected_mailboxes_safe`.
- **UI-ONLY:** inactivity auto-logout (`useInactivityTimeout.ts`) — client-side only; a valid JWT still works via direct API.
- **MIS-WIRED:** concurrent-session control — `user_sessions` is never populated; `enforceSessionLimits` is a no-op (and couldn't revoke a Supabase JWT anyway).
- **UNSAFE:** NINO/UTR stored as plaintext `text` on `clients`/onboarding (no encryption, no masking view) — defended only by table RLS.
- **Watch:** anon onboarding RPCs keyed on a bare application UUID (IDOR risk); `workpaper-files` bucket has policies but no creation statement in migrations (verify live); historically-public `filing-documents` objects pre-`20251218231937`.

### 4.2 CRM → Quote → Engagement → Client → Contacts (Phases 3, 4, 10)
- **WORKS:** lead-type/client-type share a UI list; quotes/quote_lines/acceptance tokens; manual "Convert to Client" has an EL gate (app-layer, `force`-bypassable).
- **UNSAFE:** client_type/lead_type are plain `TEXT` (no enum/CHECK); `AddClientDialog` direct-create bypasses CRM/EL; **quote acceptance activates before EL** (see §3); no one-primary-contact enforcement.
- **MISSING (mock):** Companies House — `companies-house-sync` returns hardcoded mock data, no live API/key; CRM discards everything but company name.
- **MISSING:** lead stage history (who/when/manual-vs-auto); EL re-trigger on service/fee change (flag + helper exist, **no consumer**); initial signing contact at signup; signer permissions (`can_sign` exists, unused); Partner/Member & Trustee contact types; client-type gating on Contacts tab.
- **MIS-WIRED:** "Send Quote" from CRM is a deep-link only; CH data never persisted to lead; EL signing link view-only; per-client EL status badge ignores client id; `EditClientDialog` silently drops type-specific fields on save; quote→engagement loses the agreed fee.
- **Duplicates:** 5 client-creation paths; 2 chasing engines (`automation_chaser_runs` vs `crm_followup_sequences`); 2 lead stage-update handlers; 2 EL signing routes.

### 4.3 Services, Jobs, Deadlines, Rollover (Phases 6, 7, 13) — the operating core
- **WORKS:** DB-backed `services_catalog` with CRUD; server-side job status-transition trigger (`validate_job_status_transition`); deadlines genuinely relational; **CT payment = ARD + 9 months + 1 day is correct** (the brief's explicit trap is avoided); VAT/SA/CH core date rules correct.
- **MIS-WIRED:** catalogue **seed codes ≠ engine codes** (fresh org generates nothing); jobs link to service by **free-text `service_type`, no FK**; EL-on-change flag set but unconsumed; manual `CreateJobDialog` uses legacy 4-state vocabulary the trigger rejects → orphan/invalid jobs.
- **MISSING:** **rollover entirely unimplemented** (columns only); CGT (60-day), MTD quarterly (7 Aug/Nov/Feb/May) and Charity deadline rules absent — CGT lines actively excluded from generation.
- **DUPLICATE/UNSAFE:** two deadline engines (DB RPC vs `deadline-engine.ts`) that disagree on VAT; frontend never calls the RPC. `public_accept_quote_by_token` redefined 4+ times across June migrations (confirm last wins).

### 4.4 Questionnaires, Workpapers, HMRC Auth, Filing spine (Phases 5, 11, 12, 16)
- **Immutable spine verdict: EXISTS-BUT-BYPASSED.** `filing_model_snapshots` is immutable (RLS `USING(false)` + triggers) and hash-sealed, but: `filings.model_snapshot_id` is **nullable, no constraint** (no DB gate against submission without an approved model); only a **test seed** inserts into it; live CT path reads `ct_computation_snapshots` (mutable), CH reads `accounts_model_snapshots` (mutable). The submission integrity check (`validate_submission_integrity`) is real but **edge-function-only** and bypassable by direct `UPDATE filings`.
- **MIS-WIRED:** questionnaire submit → job progression (`process_questionnaire_submission` has zero callers); questionnaire↔job link is a no-FK UUID with two competing mechanisms; workpaper merge service uncalled; HMRC `hmrc_authorisations` never written, collapses SA→MTD-IT and CIS→PAYE, lacks requested/failed states and `date_requested`.
- **UNSAFE:** workpapers not locked on filing acceptance (acceptance touches only `filings`); lock not RLS-enforced; reopen captures no reason; `post_to_ledger` hard-codes `is_posted=true` so bank auto-match/depreciation **auto-post without approval**.
- **WORKS:** CT600 GovTalk submission (real, with integrity gate + idempotency); template dependency on questionnaires; TB-import workpaper creation (manual trigger); single CT/SA engines reading DB rate tables; VAT OAuth (token exchange + AES-GCM encrypt + refresh).
- **FAKED/BROKEN:** RTI & CIS submit fabricate `accepted` receipts with invented references (no HMRC call); VAT submit selects non-existent columns (`access_token`) → always 400s; no shared HMRC proxy; CT sends **no** fraud-prevention headers (HMRC will reject in production); encryption key falls back to a literal dev default if env unset.
- **Duplicates:** 2 snapshot lineages; 2 workpaper-lock flags (`is_locked` vs `locked`); 2 questionnaire→job mechanisms.

### 4.5 Dashboard, Conversations, Documents, Billing, Automation (Phases 2, 8, 9, 14, 15)
- **WORKS:** most dashboard widgets are real and org/role-scoped (deadlines, overdue actions, tasks, client/lead counts); SLA engine (`sla_definitions`/`sla_instances`); Gmail/Outlook sync + send (real OAuth, cron); scroll-before-sign enforcement; chaser cadence settings + on/off; cadence-label normalisation; new event-driven automation engine with correct per-type stops.
- **MIS-WIRED (fake-ish metrics):** firm revenue uses `services_catalog.default_price`, **not** the accepted quote-line price; "lead revenue from open quotes" uses `leads.estimated_monthly_value`, **not** the `quotes` table — both violate the "no fake metrics" acceptance bar. Staff variance shows truncated user IDs, not names.
- **UNSAFE (legal):** document signing **overwrites the same row/file in place** — no separate signed version, no version history in storage; **no document audit trail** for sign/visibility/delete.
- **MISSING:** client portal document upload; 7-year auto-archive cron (`auto_archive_at` column exists, nothing acts on it); unified Conversations surface/page; conversation archive + persisted filter; revenue reporting filters & Billing tab; queued-email cancel UI.
- **LATENT:** legacy `chaser-tick` still stops only on `records_received` (dual-engine risk).

---

## 5. Prioritised gap list (cross-subsystem)

**P0 — correctness/legal/compliance, blocks "finished":**
1. Engagement-letter bypass on quote acceptance (§3).
2. No DB-enforced approved-model reference on filings; live submission uses mutable parallel snapshots.
3. Faked RTI/CIS receipts; broken VAT submit; no HMRC fraud-prevention proxy.
4. Auto-posting to ledger without approval (bank auto-match, depreciation).
5. Document signing overwrites original; no audit trail (legal).
6. NINO/UTR plaintext at rest.

**P1 — operating-spine integrity:**
7. Catalogue seed ≠ engine codes (jobs never generate on a fresh org).
8. Two divergent deadline engines; CGT/MTD/Charity rules missing.
9. Questionnaire → job → workpaper chain dead-wired.
10. Rollover unimplemented.
11. Workpapers not locked on filing acceptance.
12. EL-on-change flag unconsumed.

**P2 — honesty/UX/reporting:**
13. Companies House mock (blocking production issue — must be real or honestly surfaced).
14. Revenue metrics mislabeled (default price / lead estimate vs contracted).
15. Conversations not unified/archivable; concurrent-session dead; 7-year archive never runs; legacy chaser path; client detail/contacts gaps.

---

## 6. Proposed implementation plan — four waves

Each item lands as **one** implementation (delete the parallel one), enforced by a **DB constraint/trigger** (not app code), with a **test proving the invariant cannot be bypassed.**

### Wave 0 — Foundations of truth & safety (precede all feature work)
- **EL gate:** single safe client-creation path; DB guard — no active client/jobs/engagements without a signed EL; make the emailed link actually sign; restrict/remove the other four creation paths; fix the broken tamper trigger (real `status`/`signature_data` columns).
- **Catalogue seed:** reconcile catalogue codes ↔ engine codes; add jobs→engagement/service **FK** (retire free-text `service_type`).
- **One deadline engine:** DB RPC is the single source; delete `deadline-engine.ts`; add CGT (60-day), MTD quarterly, Charity rules.
- **One filing spine:** adopt `filing_model_snapshots` as canonical; route live CT/CH submission through it; **make `model_snapshot_id` mandatory** (NOT NULL + integrity trigger) — enforce "no submission without an approved, hashed model" in Postgres.
- **Security baseline:** encrypt NINO/UTR (pgsodium); either implement session enforcement properly or remove the dead feature.

### Wave 1 — Wire the job-centric operating spine end-to-end
- Questionnaire submit → job progression → workpaper materialisation (wire `process_questionnaire_submission`), stop chasers, notify; unify the questionnaire↔job link onto one FK'd mechanism.
- Records-verified → workpaper creation; **workpaper lock on filing acceptance** + unlock-with-reason (DB-enforced); consolidate `is_locked`/`locked`.
- **Rollover engine** (recurring jobs/deadlines by service/period rules).
- Consume the EL-on-change flag (mark changed service "pending", trigger new EL).

### Wave 2 — Filing & HMRC correctness
- **Shared HMRC call proxy** (sole egress) with fraud-prevention headers + uniform request/response audit; per-service authorisation status with real lifecycle (SA vs MTD-IT, CIS vs PAYE; requested/authorised/failed/expired/revoked + dates).
- Fix VAT submit (column names); build **real** RTI/CIS (remove fakes); provision encryption key (no dev fallback).
- **Auto-draft journals** for approval instead of auto-posting; route bank auto-match/depreciation through a draft→approve→post gate.

### Wave 3 — Surfaces, honesty & polish
- Dashboard/billing revenue from **contracted quote-line prices**; lead revenue from the `quotes` table; revenue filters + Billing decision.
- Document **audit trail + separate signed-version storage + 7-year archive cron**; portal upload.
- Unified Conversations page + archive + persisted filter; retire legacy chaser engine; queued-email cancel UI.
- Full type-aware client detail tabs; contacts types/gating/primary-contact enforcement.
- Companies House: real API integration **or** honest "blocked — sandbox only" status (no fabricated data).

---

## 7. Files likely to change (indicative)
- **Migrations (new):** EL-gate constraints/trigger; canonical catalogue seed; jobs↔service FK; deadline-rule additions (CGT/MTD/Charity); `filings.model_snapshot_id` NOT NULL + integrity trigger; NINO/UTR encryption; document audit table + `auto_archive_at` cron; HMRC authorisation lifecycle columns; journal draft/approval queue.
- **Edge functions:** `hmrc-call-proxy` (new); `hmrc-vat-submit` (fix); `rti-submit`/`cis-submit` (real); `companies-house-sync` (real or gated); questionnaire submit path; rollover function; 7-year archive cron; session registry (or removal).
- **Services/components:** consolidate client-creation; `deadline-engine.ts` (delete); `filing-snapshot-service.ts` (make canonical path); `EngagementLetterPreview.tsx` (signable); `FeeAggregationPanel.tsx`/`DashboardKPICards.tsx` (real revenue); `document-service.ts` (versioned signed files); conversations surface.

## 8. RLS / security implications
- New DB gates must remain SECURITY DEFINER + org-scoped; the EL gate and approved-model gate must be **constraints/triggers**, not app checks.
- Encryption (pgsodium) for NINO/UTR; provision real HMRC/token encryption keys.
- Verify `workpaper-files` bucket creation/policy alignment live; audit pre-`20251218231937` `filing-documents` objects; add a secondary secret to anon onboarding RPCs.

## 9. Blocking decisions (need your call before Wave 0)
1. **Canonical filing spine:** consolidate onto existing `filing_model_snapshots`, or build `approved_financial_model_versions` per `filing-engine-spec-v2`? (Recommendation: consolidate onto what exists; do not add a sixth parallel structure.)
2. **Direct "Add Client":** remove, or keep as restricted draft-only?
3. **Companies House:** provision a live API key now, or ship with the integration honestly gated as "blocked"?
4. **Sequencing:** confirm the EL-bypass hotfix runs as a standalone change ahead of Wave 0 proper.

---

## 10. Provenance
Audit conducted 2026-06-17 across five parallel read-only investigations (security/RLS; CRM/client/contacts; services/jobs/deadlines; questionnaires/workpapers/filing; dashboard/conversations/documents/billing/automation), each citing current migrations, edge functions, services and components. Supersedes `docs/adversarial-audit-results.md` (2026-02-18) as the current-state reference.

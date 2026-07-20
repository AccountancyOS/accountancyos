# AccountancyOS — Client Screen Gap Analysis

**Date:** 2026-07-20 · **Method:** 4 parallel Fable code auditors against a target "client operational control-centre" spec, each scoring requirements **BUILT / PARTIAL / MISSING** with table/file/migration evidence. · **Screen audited:** `src/pages/ClientPortal.tsx` (route `/clients/:clientId` — the accountant's client view).

## Executive verdict

**The data model is roughly 55–60% of the target; the client-facing screen is roughly 15–20%.** Almost every gap is one of two shapes:

1. **The data exists but isn't surfaced.** Detail tables, billing tables, audit logs, override tables, an HMRC auth-gating service — all present, none rendered on the client screen. This is the same "mechanisms exist but are unwired" pattern the July code audit found, now at the UI layer.
2. **The orchestration between layers is manual, not event-driven.** Jobs, questionnaires, workpapers and chasers exist as islands; the handshakes that should move a job from "records requested" → "received" → "verified" → "workpaper" → "ready to file" are done by a human calling an RPC, not fired by events.

The spec is not describing a different app — it's describing the mature version of the one that exists. The skeleton (services → jobs → deadlines, chaser job-anchoring, immutable event log, override tables) is real. What's missing is the presentation layer and the wiring between the islands.

## Scoreboard

| Outline section | Data model | Screen/render | Headline gap |
|---|---|---|---|
| 1. Client header | ~30% | **~15%** | ~10 fields not shown; both header actions disabled; no `recurring_fee` anywhere |
| 2. Overview tab | n/a | **0%** | Tab does not exist |
| 3. Details tab | ~65% | **0%** | 4 detail tables fetched but never rendered; no Details tab |
| 4. Contacts | ~60% | ~50% | Exists (`ContactsList`); entity-specific permissions partial |
| 5. Services tab | ~40% | ~35% | No fee/partner/staff/automation columns on `engagements`; Add-service disabled |
| 5b. Service-variation flow | ~5% | 0% | No variation→letter→re-sign→activate loop; only path is a new quote |
| 6. Billing tab | ~40% | **0%** | "Coming soon" placeholder; no DD mandate, no fee-change ledger |
| 7. Authorisations | ~20% | ~10% | No dedicated tab; missing CIS/MTD-IT/CH; auth-gating code is dead |
| 8. Jobs model | ~55% | partial | Parallel statuses collapsed into one linear enum |
| 8b. Job lifecycle stages | ~55% | — | 9 of ~16 stages; transitions manual |
| 9. Records-request lifecycle | ~55% | partial | Strong chaser engine, weak orchestration; no auto status advance |
| 10. Questionnaires | ~70% | ~40% | Period-job link exists in schema; tab queries by client, not job |
| 11. Documents | ~55% | partial | `job_documents.job_id` exists; no period; tagging manual |
| 12. Workpapers | ~50% | partial | **Two competing workpaper tables**; no auto-create on verify |
| 13. Deadlines | ~60% | partial | **No payment classification** (refund vs due indistinguishable) |
| 14. Conversations | ~50% | partial | Flat list, no job grouping, no send-state lifecycle |
| 15. Automations visibility | ~60% | **0% on client screen** | No tab; instances have no `job_id`; override UI absent |
| 16. Audit history | ~80% | **0% on client screen** | Logs exist (one immutable); no client-scoped tab |

---

## The six structural findings that matter most

These cut across sections and should be fixed before the cosmetic gaps, because everything else depends on them.

### S1 — The client screen is a thin shell that only understands individuals
`ClientPortal.tsx` queries **only the `clients` table, never `companies`** (line 40). Consequences: the entity name is hardcoded `first_name last_name` (line 84), the type badge is hardcoded `"Individual Client"` (line 87, ignoring `clients.client_type`), and **company clients render blank**. The four detail-table joins (`client_detail_sa/cgt/partnership/charity`, lines 43–46) are fetched and **never rendered** — a dead query. So the single most-used screen cannot correctly display a limited company, which is half your client base.

### S2 — One linear job status vs the spec's parallel statuses
The spec models records / questionnaire / workpaper / review / approval / filing as **independent** statuses on a job. The build collapses all of them into **one `jobs.status` enum with 9 values** (`blank, records_requested, records_received, accountant_queries, client_queries, accountant_review, client_review, ready_to_file, completed` — `chk_jobs_status`, migration `20260217105419`). A job therefore *cannot* express "records verified AND workpaper in review" at once. The sub-artifact states live on their own tables (`questionnaire_instances.status`, workpaper status, `filings` status) and are **not reconciled back onto the job**. This is the highest-impact modeling decision to revisit.

### S3 — Two lifecycle systems, one referencing a dead status
The **canonical** engine (`lifecycle_upsert_job_with_deadlines`, `20260630081709`) creates **only jobs + deadlines**. The records-request / questionnaire / workpaper orchestration lives in a **parallel legacy path** (`create_job_from_template`, `trigger_records_request`, `20251203235853`) that fires on job status **`awaiting_info` — a value not in the current status CHECK**, so it's stranded. This is the "two lifecycle systems" divergence from the project notes, now confirmed in the DDL. Until these are reconciled, adding orchestration to one path silently bypasses the other.

### S4 — No event-driven handshakes
The transitions that should be automatic are all **manual** (`update_job_status_safe` with a caller-supplied status): questionnaire-submitted → `records_received`, records-verified → create workpaper, workpaper-locked → `ready_to_file`. The chaser engine *reads* `jobs.status` to know when to stop (`chaser-tick` stops at `records_received`) but **nothing writes** the advancing status when a client actually submits. So "submitting your records stops the chasers" only works if a human remembers to move the status.

### S5 — `automation_workflow_instances` has no `job_id`
Confirmed: the workflow-engine instance table is keyed on `org_id + client_id + company_id + template_id + period_key` with **no `job_id`** (`20260217112409`). Only the **chaser** side (`automation_chaser_runs.job_id`) is job-anchored. So the spec's core principle — "show which job this automation relates to" — is **structurally impossible** for the entire workflow-engine half until a `job_id` is added. This blocks any credible Automations tab.

### S6 — A pile of built-but-unwired assets
Echoing the July audit: several complete mechanisms are written and connected to nothing.
- `src/lib/hmrc-auth-check.ts` — a full SA/CT/VAT/PAYE/CIS auth-gating service; **zero importers**. A CT600 job can reach `ready_to_file` with no authority check.
- `engagement_letter_required` flag + `flag_engagement_letter_on_change` trigger — sets a "needs re-signature" flag on service change that **nothing reads**.
- `automation_pauses`, `automation_client_overrides`, `automation_job_overrides` — full tables with RLS, referenced **only in generated types**; no UI to set them.
- `ServiceStatusDashboard` — imported into `ClientPortal.tsx`, never rendered.

---

## Live schema-drift flags (fix or they bite at runtime)

- **`ClientServicesTab.tsx:37` selects `services_catalog.category`** — that column doesn't exist in any migration or in `types.ts`. This query **400s at runtime** unless the live DB carries an un-migrated column (Lovable drift).
- **`awaiting_info`** job status (S3) — referenced by legacy `trigger_records_request`, not in the current CHECK.
- **Two workpaper tables** — `workpaper_instances` (draft/in_progress/ready_for_review/finalised) and `job_workpaper_instances` (draft/in_review/locked, with preparer/reviewer/lock). Both live; reconcile before building on either.
- **`client_messages` has no `job_id`** while `email_messages` does — job-linking of conversations is via a bolt-on `message_entity_links` table, used only with `entity_type='job'`.

---

## Recommended build order

Grouped so each phase unblocks the next. This is deliberately model-first — surfacing UI on top of the current model would harden the wrong shapes.

### Phase 1 — Fix the load-bearing model (unblocks everything)
1. **Add `job_id` to `automation_workflow_instances`** (S5) — precondition for any job-anchored automation view.
2. **Reconcile the two lifecycle systems** (S3): make the canonical engine own records/questionnaire/chaser/workpaper creation, or explicitly delegate; remove the stranded `awaiting_info` path. **Pick one workpaper table.**
3. **Decide the job-status model** (S2): either add explicit parallel sub-status columns (records/workpaper/review/filing) or a reconciled view that projects sub-artifact states onto the job. Everything operational depends on this choice.
4. **Fix `services_catalog.category` drift** so the Services tab stops 400-ing.

### Phase 2 — Wire what already exists (cheap, high value)
5. **Event-driven handshakes** (S4): questionnaire-submit → `records_received` (stops chasers automatically); records-verified → create workpaper; workpaper-locked → `ready_to_file`.
6. **Wire `hmrc-auth-check`** (S6) into filing/job readiness so a filing can't be "ready" without authority.
7. **Consume the `engagement_letter_required` flag** — the start of a real service-variation flow.

### Phase 3 — Surface it on the client screen (the visible gaps)
8. **Make `ClientPortal` entity-aware** (S1): load `companies`, drop the hardcoded type, and **render the Details tab** from the already-fetched detail tables.
9. **Overview tab** — jobs / records / deadlines / comms / tasks summary (all the underlying queries already exist as sibling tabs).
10. **Automations tab** (needs S5's `job_id`) — per-automation status, next action, recipient, and a first override control from the existing override tables.
11. **Authorisations tab**, **Billing tab** (data layer is ~40% there), and enable the disabled header actions + Add-service.

### Phase 4 — Enhancements
12. **Payment classification** on deadlines (due / made / refund / nil / unknown) so refunds don't get payment chasers.
13. **Conversations** job-grouping + send-state lifecycle (fold `email_queue` state in).
14. **Client-scoped Audit History tab** over `audit_log` + `automation_workflow_events`.

---

## Appendix — per-section evidence

Full evidence (columns, file:line, migration ids) is in the four Fable auditor transcripts under this session's `tasks/` directory. Key anchors:
- Header/Details: `ClientPortal.tsx:40,84–115`; detail tables `20260202112704`.
- Services/Billing/Auth: `ClientServicesTab.tsx:37,92`; `engagements` base `20251125171545:96`; `hmrc_authorisations` `20260202134808:36`; `hmrc-auth-check.ts`.
- Jobs/Records/Workpapers: `jobs` `20251126133923`; status CHECK `20260217105419:14`; rollover `20260630110238`; canonical engine `20260630081709`; questionnaire `20251126114216`; workpaper split `20251127004529` vs `20260217130613`.
- Deadlines/Automations/Audit: `deadlines` `20251127002312`; `automation_workflow_instances` `20260217112409:106`; override tables `20260531225541`; `audit_log` `20251201222625:114`.

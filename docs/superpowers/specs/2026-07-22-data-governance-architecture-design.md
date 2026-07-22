# Client Data Governance Architecture — Design

**Date:** 2026-07-22 · **Status:** approved (owner-confirmed decisions inline) · Launch architecture, not MVP.

## Goal
One authoritative, auditable, transactional model for client/company data across its whole lifecycle —
onboarding capture, approval, portal maintenance, staff chasing, verification, and reporting — with
strict handling of sensitive personal data. No partial states, no name-only matching, no silent
overwrites of authoritative data.

## Owner-confirmed decisions
1. **Values in typed columns; a governance layer on top.** Authoritative values of record stay in the
   existing typed columns (`companies`, `company_persons`, `clients`, `client_detail_*`). A governance
   layer tracks *requirement, status, source, and verification* per (subject, field) and references
   those columns — it does NOT store values.
2. **Person identity: CH-officer pre-link + create-on-approval.** Onboarding people carry a stable id
   and are pre-linked to an existing `company_persons` where a Companies House officer match exists;
   unmatched people are created at approval. Never match by name alone.
3. **Sensitive data: masked-by-default for all org staff; reveal is audited.** Any authenticated org
   member may reveal NINO/UTR/DOB/home-address, but it is masked by default in normal UI and every
   reveal is written as an access-audit event. Never in logs/errors.

## Model

### 1. Requirements catalog (`data_requirements`) — code-defined, DB-registered
A registry of the data points the platform governs, each with: `field_key` (e.g. `person.nino`,
`company.vat_number`), `subject_kind` (`company` | `client` | `person`), applicability (entity type +
service condition — e.g. VAT only when a VAT service is engaged), `sensitivity` (`normal` | `sensitive`),
`provider` (`client` | `firm` | `companies_house`), `requires_verification` (bool), and the authoritative
column it maps to. Drives onboarding fields, portal fields, chasing lists, and reporting completeness —
one definition, every surface.

### 2. Data-point state (`data_point_state`)
Per (`subject_kind`, `subject_id`, `field_key`): `status`
(`outstanding` | `provided` | `pending_verification` | `verified` | `rejected` | `not_applicable`),
`source` (`client` | `firm` | `companies_house`), `verified_by`/`verified_at`, `updated_at`. The value
itself is read from the mapped typed column; this row is the *governance state* of that value. Org-scoped
RLS. Completeness reporting = aggregate over this table filtered by the requirements catalog.

### 3. Change requests (`data_change_requests`) — the controlled-mutation lifecycle
A submitted change to an authoritative value. Columns: subject, `field_key`, `proposed_value`
(masked at rest for sensitive fields), `current_value_ref`, `origin` (`onboarding` | `portal` | `staff`),
`status` (`submitted` | `needs_more_info` | `approved` | `rejected`), `requested_by`, `reason`,
`evidence_ref`, `decided_by`/`decided_at`, `decision_note`. Non-sensitive contact/correspondence-address
changes bypass this (applied immediately + audited); identity/tax-sensitive changes MUST go through it —
the verified value stays authoritative until staff approve.

### 4. Immutable audit (`data_audit_log`) — append-only, field-level
Every material data change (approval merge, immediate change, change-request decision): `subject`,
`field_key`, `old_value_masked`, `new_value_masked` (sensitive values masked), `actor`, `at`, `origin`,
`decision`, `change_request_id?`. Append-only (no update/delete; enforced by trigger + RLS). Sensitive
old/new stored masked. This is the system of record for "who changed what, when, from where, why."

### 5. Approved-onboarding snapshot (`onboarding_approval_snapshots`)
On approval, an immutable JSON snapshot of exactly what was approved (the provisional onboarding data +
the resolved person identities + the field-level decisions). Never mutated. Referenced by the audit rows.

## Approval merge — single, transactional, idempotent
A new RPC `approve_onboarding_transactional(p_application_id, p_actor)` (does NOT hack the near-duplicated
`lifecycle_approve_onboarding`; supersedes/wraps it). In ONE transaction:
1. Load provisional onboarding data (`onboarding_applications` + `personal_details`).
2. **Resolve person identity** per person: use the onboarding person's stable id → existing
   `company_persons` link if pre-linked via a CH officer match; else create a new `company_persons` row.
   Never name-only.
3. **Merge** business fields → `companies`/`clients`; personal fields → each resolved `company_persons`.
   **Preserve** CH-controlled fields, verified-officer links, and existing `portal_access` links —
   never overwrite them from client-entered onboarding data (client data fills gaps / proposes, does not
   clobber verified/CH data).
4. Update `data_point_state` (mark provided/verified as appropriate), write field-level `data_audit_log`
   rows (source=onboarding), and the immutable `onboarding_approval_snapshots`.
5. **All-or-nothing:** any validation/matching/conflict failure → ROLLBACK + set a specific
   staff-visible failure state on the application (`approval_blocked` + reason), never a partial approve.
Idempotent: re-running on an already-approved application is a no-op (guarded by status + snapshot).

## Portal change workflow + staff review queue
- Client edits only their own personal data + entities they're authorised for (`portal_access`).
- **Non-sensitive** (contact, correspondence/trading address): apply immediately → typed column +
  append-only audit.
- **Sensitive** (NINO, UTR, DOB, legal name, VAT, PAYE): create a `data_change_request` (status
  `submitted`); the verified value stays authoritative until staff approve. CH registered office stays
  read-only (flag-to-correct route only).
- Client-facing statuses per field/request: saved / pending review / needs more info / approved / rejected.
- **Staff review queue**: a screen listing open `data_change_requests` with before/after (sensitive
  masked), reason, linked person/company, evidence, and approve / reject / needs-more-info actions. On
  approve → merge to the typed column + audit + update `data_point_state` + notify. Notify the
  responsible firm team on sensitive requests.

## Sensitive-data handling
- Sensitive `field_key`s flagged in the requirements catalog. Values masked by default in ALL UI;
  a "reveal" action unmasks and writes a `data_audit_log` access event (masked-by-default, all-staff,
  audited-reveal per the decision). Never rendered in logs, error messages, or toasts.

## Increment plan
- **G1 — Governance schema:** `data_requirements` (+ seed the catalog), `data_point_state`,
  `data_change_requests`, `data_audit_log` (append-only trigger), `onboarding_approval_snapshots`; RLS;
  sensitive-field registry. Pure requirements-catalog model + tests.
- **G2 — Approval-merge RPC:** `approve_onboarding_transactional` (identity resolution, preserve-rules,
  all-or-nothing + failure state, snapshot + audit, idempotent). Wire onboarding approval to it.
- **G3 — CH-officer pre-link in onboarding:** thread CH officers into the onboarding bundle so people
  are pre-identified/pre-linked (enables decision 2).
- **G4 — Sensitive masking + reveal-audit:** masking util + reveal-with-audit across the person/company
  data UI.
- **G5 — Portal change workflow:** client edit surface (immediate non-sensitive / change-request
  sensitive) + statuses, writing to the governance layer.
- **G6 — Staff review queue:** the review screen + approve/reject/needs-info → merge + audit + notify.
- **G7 — Unified completeness across surfaces:** onboarding/portal/chasing/reporting read
  `data_point_state` + catalog for "what's outstanding/verified"; retire the ad-hoc heuristics.

Each increment: TDD the pure logic, review gate, `tsc -p tsconfig.app.json` + build, push, and (owner)
Lovable apply/redeploy. Migrations additive; governance layer never duplicates authoritative values.

# Client Data Collection + Address Source-of-Truth — Design

**Date:** 2026-07-21 · **Status:** approved (owner-confirmed decisions inline)

## Problem
Onboarding collects almost no structured client data (only a signature, ID/proof-of-address files,
billing, portal email). The questionnaire→merge mechanism exists in the DB but its send-UI is
orphaned. There is no client-facing "info you still need to provide" checklist, no client self-entry
path to `clients`/`companies`/`client_detail_*`, and CH data isn't pre-populated into onboarding.
Separately, registered-office address has no editor and the company screen reads a legacy column CH
sync never populates.

## Confirmed decisions
1. **Onboarding + editable later in the portal**, with an audit trail and firm-side visibility.
2. **Field set:** UTR, VAT number, PAYE reference(s), DOB, NINO, home address — **only when
   applicable** (service-aware). No bank details this phase.
3. **Service-aware fields:** only request VAT for VAT services, payroll refs for payroll, etc. Keep
   the form short; show *why* each item is needed.
4. **Address editor = separate quick fix** (Increment A); must resolve the source-of-truth mismatch
   before users maintain addresses.
5. **Personal data is PER-PERSON on `company_persons`** (DOB, NINO, home address, personal UTR) — a
   company can have multiple directors/shareholders; a flat `dob`/`nino` on the onboarding
   application would not scale. **Company UTR stays on the company/client record.**
6. **Registered office = Companies House source of truth** — read-only, labelled "from Companies
   House", with a **flag-to-correct** route. The **editable** address is trading/correspondence.
7. **Outstanding-items list is structured by BUSINESS + each relevant INDIVIDUAL**, not one generic
   completion state.
8. **CH-derived fields labelled "from Companies House"** with an escape hatch to flag a correction.
9. **Do NOT rely on CH for exact shareholder / share-class allocations** — that needs
   confirmation-statement *filing* parsing, not the lookup API. Shareholdings stay manually maintained.

## Architecture — builds on the existing person spine
- `company_persons` (org-level person registry, from the person-model work) already holds people,
  links to the company (`company_officers`) and to an SA client (`linked_client_id`), with
  DOB/nationality/addresses. **Personal data attaches here, one record per director/shareholder.**
- Business data → `companies` (via `onboarding_applications` during onboarding, merged on approval by
  the existing `lifecycle_approve_onboarding`).
- Reuse the existing onboarding→approval merge; extend where columns are missing.

## Increments
### A — Address source-of-truth + editor (quick, first)
- Company screen (`CompanyDetail`) reads the CH-synced `registered_office_address` (jsonb), labelled
  "Registered office — from Companies House", read-only, with a "flag a correction" affordance.
  Stop reading the stale legacy flat columns; backfill legacy → jsonb where the jsonb is empty (one
  additive/data migration) so no data is lost.
- Add a manual editor for **trading/correspondence** address (`trading_address` jsonb) — firm-owned.

### B — Per-person personal-data schema
- Additive migration: add `nino` and personal `utr` to `company_persons` (DOB/address already exist).
- Company UTR/VAT/PAYE stay on `companies` (+ `onboarding_applications` for capture).

### C — The "Your details" onboarding step
- New step in `PublicOnboarding.tsx`: **business section + one section per individual**.
- Service-aware fields (VAT only if VAT service on the quote, PAYE only if payroll, etc.), each
  labelled with why it's needed. Outstanding-items checklist split by business + individuals.
- CH-derived company fields shown read-only, labelled "from Companies House", flag-to-correct.
- Token-gated public RPC saves: personal sections → `company_persons`; business fields →
  `onboarding_applications`. Approval merge carries them into `companies`/`clients`/`client_detail_*`.

### D — Portal editing + audit trail + firm visibility
- The client can view/update the same data in the portal (person-model portal access already lets a
  person see their linked entities). Audit trail on changes; firm-side visibility of what's provided.

## Out of scope (this build)
- Bank details; automated shareholder/share-class derivation from CH filings; the actual accounts/CS01
  e-signing ceremonies.

## Deferred for owner review (NOT built in the unattended run — need your sign-off before touching)

### C-merge — write captured onboarding data into the real records on approval
The "Your details" step captures into `onboarding_applications` (`utr`, `vat_number`, `paye_reference`,
`personal_details` jsonb, `ch_correction_note`). It is **not yet merged into `companies`/`clients`/
`company_persons` on approval** — deliberately, because `lifecycle_approve_onboarding` is a large,
security-sensitive function that has **near-duplicate copies across migrations** (the exact vocabulary-
drift / duplicate-function trap in this codebase). Building it blind overnight was too risky.
Plan when approved:
1. Identify the single effective `lifecycle_approve_onboarding` (latest definition) — do NOT edit a stale copy.
2. Business fields → `companies`/`clients` (company `utr`/`vat_number`/`paye_reference`; some already merge).
3. For each entry in `personal_details`: match or create a `company_persons` row (by name, org-scoped),
   and write `date_of_birth`/`nino`/`utr`/`home_address`. Preserve any CH-synced/`linked_client_id` data.
4. Surface `ch_correction_note` to staff as a "client flagged the register" prompt.
Until this lands, the captured data lives on the onboarding application and is visible to staff via
`CapturedDetailsPanel`, but doesn't auto-populate the client/company record.

### D — Portal editing + audit trail
Let a client edit the same personal data in the portal after onboarding (the person-model `portal_access`
already lets a person see their linked entities), writing to `company_persons`, with an audit-log entry
per change and firm-side visibility. Not started.

### Known limitations of what WAS built (C-frontend)
- **Service-awareness is a keyword heuristic** on the accepted-quote line text, not the canonical
  `requires_vat_settings`/`requires_payroll_settings` flags — the anon onboarding session can't read
  `services_catalog` (RLS: authenticated only) and the quote snapshot doesn't freeze canonical service
  codes. Revisit if the heuristic mis-detects. A clean fix would freeze the canonical service flags into
  the quote snapshot at accept time, then read them here.
- **No CH pre-fill in onboarding**: CH company/director data isn't in the onboarding bundle anywhere, so
  the step degrades to manual person entry (nothing fabricated). Decision 4-adjacent: to pre-fill, the
  lead-stage `leads.ch_company_profile` (already captured) would need to be threaded into the onboarding
  bundle / a CH lookup added to the onboarding creation path.

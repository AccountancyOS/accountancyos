# Client Profile + Person/Director Model + Live Companies House — Design

**Date:** 2026-07-20 · **Status:** design for approval

## Goal

A richer, BrightManager-style company profile, backed by a single person record that links a
director to both the company and (optionally) their own self-assessment client record, with one
portal login that sees every entity they're linked to. Company data (and directors) come from the
**live** Companies House Public Data API, not the current sandbox mock.

## Key decisions (approved)

- **Person spine = `company_persons`** (org-level registry; has `linked_client_id → clients`).
- **Person ↔ company = `company_officers`** (M:N, `role` director/secretary/…). One person → many
  companies + one SA client. No new identity table.
- **Portal access = full access to every linked entity** (a `portal_access` row per entity grants
  full portal access; no per-link permission granularity for now).

## What already exists (build on, don't rebuild)

- `company_persons` (org-level, `linked_client_id`, `ch_officer_id`, full person detail).
- `company_officers` (person↔company, role, appointed/resigned, `ch_appointment_id`).
- `portal_access` (one row per user↔entity; multi-entity login + entity switcher already work).
- Company profile columns: `status`, `registered_office_address`, `trading_address`, `phone`,
  `year_end_month/day`, `confirmation_statement_*`, VAT fields, `sic_codes`, `ch_company_profile`.

## Gaps this design closes

1. **Companies House is a sandbox mock.** `companies-house-sync` never calls the real API and never
   writes officers to `company_persons`/`company_officers` (officers live only in
   `ch_company_profile` jsonb). Lovable wired `search`/`profile` live out-of-git (and it's currently
   throwing a runtime error — see Risks).
2. **Missing profile fields:** `trading_as`, a primary-contact designation, and a signatory concept.
3. **No accountant UI** to designate a primary contact, mark ≤10 signatories, link a person to an SA
   client, or grant portal access.

## Design

### Component 1 — Live Companies House rewrite (`companies-house-sync`)

Replace the mock with the real **Public Data API** (`https://api.company-information.service.gov.uk`).

- **Auth:** HTTP Basic — `Authorization: Basic base64(CH_PROD_API_KEY + ":")` (key as username, empty
  password). This is the classic pitfall and the likely cause of the current runtime error.
- Actions `search`, `profile`, `sync` all hit the live API; **mock generators removed**.
- **Officer promotion (new):** `sync` upserts each CH officer into `company_persons` (idempotent on
  `ch_officer_id`, org-scoped) and `company_officers` (idempotent on `ch_appointment_id`), mapping
  name/DOB/nationality/address/role/appointed/resigned. **Preserves any existing `linked_client_id`**
  so a manual person↔SA-client link is never clobbered by a resync.
- Keep the existing review-gated scalar-diff staging (`companies_house_diff_staging`) for
  profile-field changes and the CS01-deadline creation. Rate-limit aware (CH allows 600 req/5 min);
  fail cleanly (never crash) on non-2xx, surfacing the CH status.
- Persist the accounts dates from the profile response (`accounts.next_made_up_to`, `next_due`) so
  the profile view and deadlines can use them (new columns — see Component 2).

### Component 2 — Schema additions (one migration)

- `companies.trading_as text` — trading name when different from the legal name.
- `companies.primary_contact_person_id uuid REFERENCES company_persons(id) ON DELETE SET NULL` — the
  **correspondence** primary contact. May be ANY person associated with the company (an officer OR a
  non-officer such as a bookkeeper). This is a contact designation, **not** a signing right.
- `companies.accounts_next_made_up_to date`, `companies.accounts_next_due date` — from CH profile.
- `company_officers.is_signatory boolean NOT NULL DEFAULT false` — a **document signer** for
  statutory accounts. Lives on `company_officers` because signers are drawn **only from active
  directors/officers** (`resigned_at IS NULL`). **≤10 per company**, enforced in UI and by a
  `BEFORE INSERT/UPDATE` trigger that also rejects setting it on a resigned officer.
- `contacts.person_id uuid REFERENCES company_persons(id) ON DELETE SET NULL` — lets a
  **non-officer** correspondence contact (bookkeeper, etc.) be tied to the person spine (so it can
  become a primary contact and/or link to an SA client / portal) without being an officer. Officers
  need no `contacts` row; they're associated via `company_officers`.
- `portal_access` — add the missing company-side partial unique index
  `(organization_id, company_id, user_id) WHERE company_id IS NOT NULL AND is_active`.
- "Dormant" is surfaced from CH `company_status` (`ch_company_profile` jsonb / real after sync), not
  a new column.

**Roles are three distinct things, kept separate:**
- **Contact** — anyone associated with the company (officers ∪ non-officer `contacts`). Correspondence only.
- **Primary contact** — one designated correspondence contact (any person). No signing right implied.
- **Signatory** — may sign statutory accounts. Only settable on **active officers**; ≤10 per company.
A bookkeeper can be the primary contact but is never a signatory unless they are also a current officer.

### Component 3 — Portal multi-entity linking (accountant flow)

An accountant action "Give portal access" on a person: creates a `portal_access` row (invite) for
**each** entity that person is linked to — their `linked_client_id` (SA client) and every company
they're an officer of — keyed on the invited user. Because the portal already resolves all of a
user's `portal_access` rows into the entity switcher, one login then sees the SA record and the
company(ies) with full access. Reuses the existing invite/token columns on `portal_access`.

### Component 4 — Rich company profile view (CompanyDetail)

An Overview/Details section rendering: legal name + `trading_as`, status (active/dormant), company
number, incorporation date, registered office + service address, phone, year end / ARD, VAT status,
SIC; the key deadlines (accounts, CT600, CS01, VAT, payroll — from the `deadlines` table + the CH
accounts dates); and the **primary contact** name. Directors/officers list (already exists in cosec
UI) is surfaced here with controls to designate the primary contact and toggle signatories.

### Component 5 — Person / contact management

On a company, one combined **contact list** = active officers (via `company_officers` →
`company_persons`) ∪ non-officer contacts (`contacts` with `person_id`). From it the accountant can:
add people promoted from the CH import; add a non-officer contact (creates a `company_persons` +
`contacts` row); designate one **primary contact** (any person in the list — correspondence);
toggle **signatory** (only on active officers, ≤10); and **link a person to an SA client** —
associate an existing `clients` row or create a new SA `clients` record and set
`company_persons.linked_client_id`. From here, "Give portal access" (Component 3). The signer
selector and the primary-contact selector are distinct controls with distinct eligibility.

## Phasing (all in this build unless noted)

1. Live CH rewrite + officer promotion (foundation; also fixes the current runtime error).
2. Schema additions (Component 2).
3. Rich company profile view (Component 4).
4. Person/contact management: primary contact, ≤10 signatories, SA-client linking, portal grant
   (Components 3 & 5).
5. **Out of scope / follow-on:** the actual accounts e-signing ceremony (collecting the signatures).
   This build captures the *data* (`is_signatory`, ≤10) but not the signing workflow.

## Risks & constraints

- **Cannot verify against the live app** from here; each phase ships to git and needs Lovable apply +
  publish. Verification is by the owner in-app.
- **CH function divergence:** the deployed function is Lovable's out-of-git live patch (currently
  erroring); this rewrite makes **git the source of truth**. Lovable should deploy from git, not
  hand-patch, after this lands.
- **`companies.client_id`** is used by live code but absent from git migrations/types. This design
  does **not** rely on it — the person↔SA-client bridge is `company_persons.linked_client_id`, and
  the person↔company bridge is `company_officers`.
- **Two auth-code columns** (`auth_code`, `companies_house_auth_code`) already coexist — left as-is,
  not touched here.
- **Companies House filing** (`ch-submit`, CS01 submission) is a **separate** API with separate
  credentials and is **out of scope** — this design is Public-Data (lookups + officers) only.
- CH API rate limits (600/5 min) — handled by failing cleanly, not looping.

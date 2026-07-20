# Client Profile + Person/Director Model + Live Companies House — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a rich company profile backed by the existing `company_persons` person spine, with live Companies House officer data, a primary-contact/signatory model, and multi-entity portal linking.

**Architecture:** Reuse existing tables — `company_persons` (org-level person, `linked_client_id`→SA client), `company_officers` (person↔company, directors), `portal_access` (one row per user↔entity, multi-entity login already works). Add small columns, a live CH rewrite that promotes officers into the real tables, and accountant UI. No new identity table.

**Tech Stack:** Supabase Postgres (RLS + migrations), Deno edge functions, React + TanStack Query + shadcn/ui, Vitest (pure-model + source-structure tests — no Deno/live harness).

## Global Constraints (verbatim from spec + repo reality)

- Person spine is `company_persons` (org-level); person↔company is `company_officers`; person↔SA-client is `company_persons.linked_client_id`. No new identity table.
- Three distinct roles: **contact** (associated), **primary contact** (one, correspondence, any person), **signatory** (may sign accounts, **active officers only**, **≤10 per company**).
- Portal access = full access per linked entity (no per-link permission granularity).
- CH scope is **lookup-only** (profile, filing dates, officers). CS01/filing submission stays sandboxed, out of scope.
- CH Public Data API auth is HTTP Basic: `Authorization: Basic base64(CH_PROD_API_KEY + ":")` (key as username, empty password).
- Every new migration: add its version to `KNOWN_UNAPPLIED` in `src/test/regression/migration-application-drift.test.ts` (pending Lovable apply). New RPCs: cast the `.rpc()` call frontend-side until types regenerate.
- Per-task gate: `npx tsc --noEmit` (0 errors), `npx vitest run` (green), and for frontend `npx vite build` (then revert any regenerated `supabase/functions/mcp/index.ts`). Live/edge behaviour is owner-verified in-app.
- Never log or echo `CH_PROD_API_KEY`.

---

## File Structure

- `src/lib/companies-house-live.ts` (new) — pure helpers: `chBasicAuthHeader(key)`, `mapChOfficerToPerson(officer)`, `mapChOfficerToOfficerRow(...)`, `parseChName(chName)`. Testable, no I/O.
- `supabase/functions/companies-house-sync/index.ts` (rewrite) — real Public Data API; search/profile/sync; officer promotion; mocks removed.
- `supabase/migrations/2026072019xxxx_company_profile_person_fields.sql` (new) — schema adds + signatory trigger.
- `supabase/migrations/2026072019yyyy_add_service_person_rpcs.sql` (new) — `set_primary_contact`, `set_signatory`, `link_person_to_sa_client`, `grant_person_portal_access` RPCs.
- `src/lib/company-signatory-model.ts` (new) — pure: `canBeSignatory(officer)`, `signatoryCapReached(count)` (cap = 10).
- `src/components/company/CompanyProfilePanel.tsx` (new) — rich profile render.
- `src/components/company/CompanyContactsPanel.tsx` (new) — combined contact list; primary/signatory controls; SA-link; portal grant.
- `src/pages/CompanyDetail.tsx` (modify) — mount the two panels.
- Tests under `src/test/regression/`.

---

## Phase 1 — Live Companies House (foundation; fixes today's runtime error)

### Task 1: Pure CH helpers + tests

**Files:**
- Create: `src/lib/companies-house-live.ts`
- Test: `src/test/regression/companies-house-live.test.ts`

**Interfaces — Produces:**
- `chBasicAuthHeader(key: string): string` → `"Basic " + base64(key + ":")`
- `parseChName(chName: string): { first_name: string; last_name: string }` — CH "SURNAME, Forename" → parts
- `mapChOfficerToPerson(o: ChOfficer, orgId: string): PersonUpsert` where `ChOfficer = { name; officer_role; appointed_on; resigned_on?; date_of_birth?: {month:number;year:number}; nationality?; country_of_residence?; occupation?; links?: { self?: string } }` and `PersonUpsert = { organization_id; first_name; last_name; nationality?; occupation?; ch_officer_id?: string }` (ch_officer_id = `links.self`)
- `mapChOfficerToOfficerRow(o: ChOfficer, companyId: string, personId: string): OfficerRow` = `{ company_id; person_id; role: 'director'|'secretary'|'llp_member'|'llp_designated_member'; appointed_at; resigned_at: string|null; ch_appointment_id?: string }` (role mapped from `officer_role`, default `'director'`; unmapped roles → `'director'`)

- [ ] **Step 1: Write failing tests** (auth header exact value; name split incl. no-comma fallback; officer→person maps DOB/nationality and ch_officer_id from `links.self`; role mapping director/secretary + unknown→director; resigned_on→resigned_at null when absent).

```ts
import { chBasicAuthHeader, parseChName, mapChOfficerToOfficerRow } from "@/lib/companies-house-live";
it("basic auth = key as username, empty password", () => {
  expect(chBasicAuthHeader("ABC123")).toBe("Basic " + btoa("ABC123:"));
});
it("splits 'SMITH, John' into last/first", () => {
  expect(parseChName("SMITH, John")).toEqual({ first_name: "John", last_name: "SMITH" });
});
it("maps secretary role, else director", () => {
  expect(mapChOfficerToOfficerRow({ name:"X, Y", officer_role:"secretary", appointed_on:"2020-01-01" } as any, "c", "p").role).toBe("secretary");
  expect(mapChOfficerToOfficerRow({ name:"X, Y", officer_role:"nominee-director", appointed_on:"2020-01-01" } as any, "c", "p").role).toBe("director");
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing). `npx vitest run src/test/regression/companies-house-live.test.ts`
- [ ] **Step 3: Implement** `src/lib/companies-house-live.ts` with the four pure functions (btoa for base64; comma split with fallback to whole string as last_name; role map `{director,secretary,llp-member→llp_member,...}` default director).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(ch): pure Companies House officer-mapping + Basic-auth helpers`.

### Task 2: Rewrite `companies-house-sync` to live API + officer promotion

**Files:**
- Modify (rewrite): `supabase/functions/companies-house-sync/index.ts`
- Test: `src/test/regression/companies-house-sync-live.test.ts` (source-structure assertions — the repo's pattern for Deno fns)

**Interfaces — Consumes:** the Task 1 helpers (reimplemented inline in Deno, since edge fns can't import from `src/` — mirror them and pin with the source test).

- [ ] **Step 1: Write source-structure test** asserting the deployed function: reads `Deno.env.get("CH_PROD_API_KEY")`; builds `Authorization: Basic ` header (not `Bearer`); fetches `https://api.company-information.service.gov.uk`; has NO `generateMock`/`[CH Sandbox]` references; on `sync` upserts `company_persons` (onConflict `ch_officer_id`) and `company_officers` (onConflict `ch_appointment_id`); never logs the key. Verify each assertion FAILS against the current (mock) `git show HEAD:...` source first (proves they discriminate).
- [ ] **Step 2: Run — expect FAIL** (current source is mock).
- [ ] **Step 3: Rewrite the function:** remove mock generators; `search`→`GET /search/companies?q=`, `profile`→`GET /company/{n}`, `sync`→profile + `GET /company/{n}/officers` + `/persons-with-significant-control`. Basic auth header. On non-2xx: return a clean `{ error, ch_status }` (never throw/crash — this fixes the runtime error). `sync` upserts officers into `company_persons` (by `ch_officer_id`, **not** overwriting `linked_client_id`) + `company_officers` (by `ch_appointment_id`); keep the existing scalar-diff staging + CS01-deadline creation; persist `accounts.next_made_up_to`/`next_due` to the new company columns (Phase 2). Keep the service-role auth gate.
- [ ] **Step 4: Run — expect PASS** (all source assertions). `npx tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat(ch): live Companies House Public Data API + promote officers to company_persons/company_officers`.
- [ ] **Owner-verify:** redeploy `companies-house-sync`; a company lookup returns real data (no runtime error); a sync populates real officers.

---

## Phase 2 — Schema additions

### Task 3: Profile/person columns + signatory trigger

**Files:**
- Create: `supabase/migrations/2026072019xxxx_company_profile_person_fields.sql`
- Modify: `src/test/regression/migration-application-drift.test.ts` (allowlist), `docs/audits/unapplied-migrations.md` (note)
- Create: `src/lib/company-signatory-model.ts` + `src/test/regression/company-signatory-model.test.ts`

- [ ] **Step 1: Write the migration** (idempotent): `ALTER TABLE companies ADD COLUMN IF NOT EXISTS trading_as text, ADD COLUMN IF NOT EXISTS primary_contact_person_id uuid REFERENCES company_persons(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS accounts_next_made_up_to date, ADD COLUMN IF NOT EXISTS accounts_next_due date;` `ALTER TABLE company_officers ADD COLUMN IF NOT EXISTS is_signatory boolean NOT NULL DEFAULT false;` `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES company_persons(id) ON DELETE SET NULL;` partial unique index `portal_access_unique_company_user` on `(organization_id, company_id, user_id) WHERE company_id IS NOT NULL AND is_active`. `BEFORE INSERT OR UPDATE` trigger `enforce_signatory_rules` on `company_officers`: if `NEW.is_signatory` then require `NEW.resigned_at IS NULL` (else RAISE) and `(SELECT count(*) FROM company_officers WHERE company_id=NEW.company_id AND is_signatory AND id<>NEW.id) < 10` (else RAISE 'max 10 signatories').
- [ ] **Step 2: Write pure model + tests** — `company-signatory-model.ts`: `canBeSignatory(o: { resigned_at: string|null }): boolean` (= `o.resigned_at == null`); `SIGNATORY_CAP = 10`; `signatoryCapReached(currentCount: number): boolean`. Tests cover resigned→false, cap at 10.
- [ ] **Step 3: Run tests — PASS**; add migration version to `KNOWN_UNAPPLIED` with reason; `npx vitest run` green.
- [ ] **Step 4: Commit** `feat(schema): company profile fields + signatory rules (active officers, cap 10)`.
- [ ] **Owner-verify:** apply migration; confirm columns/trigger exist.

---

## Phase 3 — Rich company profile view

### Task 4: `CompanyProfilePanel`

**Files:**
- Create: `src/components/company/CompanyProfilePanel.tsx`
- Modify: `src/pages/CompanyDetail.tsx` (mount it in the overview/details area)

**Interfaces — Consumes:** `companies` row (incl. new columns), `deadlines` for the company, `ch_company_profile` jsonb (for `company_status`/dormant).

- [ ] **Step 1:** Build `CompanyProfilePanel({ companyId })`: query the company + its deadlines; render legal name + `trading_as`, status (active/dormant from `status` + `ch_company_profile.company_status`), company number, incorporation date, registered office + `trading_address`, phone, year end (`year_end_month/day`), VAT status, SIC; a deadlines strip (accounts `accounts_next_due`, CT/CS01/VAT/payroll from `deadlines`); and the primary contact name (join `primary_contact_person_id`→`company_persons`). Use existing shadcn Card patterns; entity data read-only here.
- [ ] **Step 2:** Mount in `CompanyDetail` overview tab. `npx tsc --noEmit` 0; `npx vite build` green (revert mcp regen).
- [ ] **Step 3: Commit** `feat(company): rich profile panel (status, trading-as, addresses, deadlines, primary contact)`.
- [ ] **Owner-verify:** company page shows the rich profile with real CH data.

---

## Phase 4 — Person / contact management

### Task 5: Management RPCs

**Files:**
- Create: `supabase/migrations/2026072019yyyy_add_service_person_rpcs.sql`
- Modify: drift allowlist.

- [ ] **Step 1: Write RPCs** (SECURITY DEFINER, `user_has_organization_access` guard, org derived from the entity):
  - `set_primary_contact(p_company_id uuid, p_person_id uuid)` → sets `companies.primary_contact_person_id` (person must be associated with the company: an officer OR a `contacts.person_id` row; else RAISE).
  - `set_signatory(p_officer_id uuid, p_on boolean)` → toggles `company_officers.is_signatory` (trigger enforces active-officer + cap).
  - `link_person_to_sa_client(p_person_id uuid, p_client_id uuid)` → sets `company_persons.linked_client_id` (client must be same org).
  - `grant_person_portal_access(p_person_id uuid, p_user_email text)` → creates invited `portal_access` rows for the person's `linked_client_id` (if set) and every company they're an active officer of; idempotent on the partial unique indexes; returns count.
- [ ] **Step 2:** Add versions to `KNOWN_UNAPPLIED`. `npx vitest run` green.
- [ ] **Step 3: Commit** `feat(rpc): primary-contact / signatory / SA-link / portal-grant`.
- [ ] **Owner-verify:** apply; smoke each RPC.

### Task 6: `CompanyContactsPanel`

**Files:**
- Create: `src/components/company/CompanyContactsPanel.tsx`
- Modify: `src/pages/CompanyDetail.tsx` (replace/augment the contacts area)

**Interfaces — Consumes:** the Task 5 RPCs (cast `.rpc()` until types regenerate).

- [ ] **Step 1:** Build the combined contact list = active officers (`company_officers`→`company_persons`) ∪ non-officer contacts (`contacts` where `person_id` set, for this company). Per row show role, primary-contact radio (any person; calls `set_primary_contact`), signatory checkbox (**only enabled for active officers**, disabled at 10 via `signatoryCapReached`; calls `set_signatory`), an "Also an SA client" action (`link_person_to_sa_client` — pick existing client or create one), and "Give portal access" (`grant_person_portal_access`). "Add contact" creates a `company_persons` + `contacts` row.
- [ ] **Step 2:** Mount in `CompanyDetail`. `npx tsc --noEmit` 0; `npx vite build` green (revert mcp regen).
- [ ] **Step 3: Commit** `feat(company): contact management — primary contact, signatories (≤10 active officers), SA link, portal grant`.
- [ ] **Owner-verify:** designate primary + signatories; link a director to an SA client; grant portal access; the person's single login shows both entities.

---

## Self-Review (done)

- **Spec coverage:** CH rewrite→T1/T2; schema+trigger→T3; profile view→T4; primary/signatory/SA-link/portal→T5/T6; roles separated (primary any person via `set_primary_contact`; signatory active-officer-only via trigger). E-signing ceremony intentionally absent (out of scope). ✓
- **Placeholders:** none — each task names files, interfaces, and concrete SQL/TS. ✓
- **Type consistency:** `is_signatory`, `primary_contact_person_id`, `linked_client_id`, `ch_officer_id`, `ch_appointment_id`, `SIGNATORY_CAP=10` used consistently across tasks. ✓

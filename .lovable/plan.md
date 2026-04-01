
# AccountancyOS Gap Closure — Full Implementation Plan

## Wave 1: Security and Role Model (Items 1, 2, 3, 4, 5, 6, 7, 10, 20)

### 1A. Collapse to 3-role model: owner > staff > admin

The current codebase has `AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer'` with a hierarchy of viewer < staff < manager < admin < owner. The user requires a strict 3-role model with a NON-STANDARD hierarchy: **owner > staff > admin** (admin is LOWEST).

**Database migration:**
- Update `organization_users` role CHECK constraint to `('owner', 'staff', 'admin')`
- Migrate any existing `manager` rows to `staff`, any `viewer` rows to `admin`
- Update edge function `_shared/permissions.ts` to 3 roles with correct hierarchy

**Frontend changes:**
- Rewrite `src/lib/permissions.ts`: `AppRole = 'owner' | 'staff' | 'admin'`, `ROLE_HIERARCHY = ['admin', 'staff', 'owner']`
- Rewrite ALL permission mappings per the matrix:
  - **Owner**: everything (integrations, billing, team, HMRC/CH connections, all operational, all bookkeeping, all filing, all automation)
  - **Staff**: operational work (clients, jobs, deadlines, workpapers, questionnaires, documents, conversations, filings, emails, upload, job status updates, bookkeeping day-to-day). Cannot: manage users/roles/billing/org settings, connect HMRC/CH
  - **Admin**: read-only + basic non-sensitive admin tasks. Narrower than staff. Cannot: manage users/roles/billing/services/fees/automations/templates/filings authority/firm settings, connect HMRC/CH
- Update `organization-context.tsx` type to `'owner' | 'staff' | 'admin'`
- Update `usePermissions.ts`, `permission-guard.tsx`, `getRoleLabel()`
- Remove all `manager` and `viewer` references across entire codebase

**RLS rewrite:**
- All RLS policies referencing role must use the 3-role model
- `organization_users` INSERT: only via SECURITY DEFINER function `accept_invitation(token)` or `add_org_member(org_id, user_id, role)` callable only by owner
- Block self-enrolment, block role escalation (staff/admin cannot change roles)
- Provide test cases proving: non-member cannot join org, staff cannot escalate, cross-org access blocked

### 1B. Session security (Items 1, 2)

**10-minute inactivity timeout:**
- Add idle timer in `auth-context.tsx` using mouse/keyboard/touch event listeners
- On 10 minutes of inactivity, call `signOut()` automatically
- Applies to both accountant and client portal users

**Concurrent session restriction by plan:**
- Solo plan: 1 user max
- Studio plan (renamed from Team): 4 users max  
- Firm plan (renamed from Scale): 10 users max
- On login, count active sessions for the org. If at plan limit, reject login with clear message
- Use `user_sessions` table (already has the right columns)

### 1C. Audit trail enhancements (Items 3, 4)

**Session audit:** `user_sessions` already has `last_activity_at`, `ip_address`, `user_agent`. Confirmed sufficient.

**Bookkeeping detailed audit:**
- Add `bookkeeping_audit_log` table: `id, organization_id, entity_type (bank_transaction|invoice|bill|journal|payment), entity_id, action (categorized|uncategorized|created|voided|posted|reversed), performed_by, performed_at, details JSONB`
- Wire into all bookkeeping mutation functions: bank categorization, invoice create/issue/void, journal post/reverse, payment record/reverse
- Track who categorized each bank transaction and when; who undid it and when

**Sensitive event auditing (Item 4):**
- Ensure `logAudit()` is called for: login, password reset, invitation accepted, role change, mailbox connection, HMRC/CH connection, document signature, filing submission
- Track user ID, date, time for all
- Client-side updates (portal) also audited with timestamp

### 1D. GDPR data export/deletion (Item 5)

- Build edge function `gdpr-data-export` that exports all data for a client/user as JSON/ZIP
- Build edge function `gdpr-data-deletion` that anonymizes/deletes client PII with audit trail
- Add UI in Settings for owner to trigger export or deletion request
- Comply with UK GDPR: 30-day response window, right to erasure, right to data portability

---

## Wave 2: Core Operational Spine (Items 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21-30, 31-36)

### 2A. Dashboard updates (Items 8, 9, 11, 12)

**KPI cards update (Item 8):**
- Add "Total Leads" card (count from `leads` table where status not lost)
- Add "Current Firm Revenue" card (sum of active engagement fees from `engagements` + `services_catalog` pricing)
- Keep existing active clients, jobs in progress, overdue deadlines

**Revenue cards (Item 11):**
- Monthly recurring fees total (engagements with frequency = 'monthly')
- One-off fees total (engagements with frequency = 'one_off')
- Pipeline revenue (quotes in proposal_sent or chasing status)
- Top revenue service breakdown (group engagements by service, show top 5)

**Overdue actions tied to SLA (Item 9):**
- Verify `OverdueActionsPanel` reads from `sla_instances`
- SLA instances created on: inbound email, portal message, task creation, job status change
- Accountant can manually update/resolve SLA instances

**Role-scoped dashboard (Item 12):**
- Owner: sees everything including staff variance, full revenue
- Staff: sees their assigned jobs, their overdue items, their deadlines
- Admin: sees read-only summary only

### 2B. CRM changes (Items 13, 14, 15, 16, 17)

**Remove sole_trader and landlord (Item 13):**
- Remove from `CLIENT_TYPES` array in `client-types.ts`
- Migration to update existing leads/clients with `sole_trader` → `sa_non_mtd`, `landlord` → `sa_non_mtd`
- Remove from `CLIENT_TYPE_FIELD_CONFIG`, labels, descriptions, DB_TYPE_MAP

**CRM as hub for quotes (Item 14):**
- Move quote creation/management into `LeadDetailPanel`
- Remove standalone Quotes page route or make it redirect to CRM
- Quote pipeline visible within CRM stages

**Activity logging like Pipedrive (Item 15):**
- Add `lead_activities` table: `id, lead_id, org_id, activity_type (call|email|meeting|note), description, performed_by, performed_at`
- Show last contact date on lead cards
- Activity logging triggers reminder scheduling via automation engine

**Auto-won on client portal signup (Item 16):**
- Client completes: sign terms/EL + create portal login → lead auto-moves to Won
- Conversion happens on these steps completing, not on manual drag

**Double conversion protection (Item 17):**
- Add `converted_at` check before conversion
- Lead can only move to Won when: EL signed + portal login created
- Idempotent guard on `convertLeadToClient`

### 2C. Client creation & uniqueness (Items 18, 19)

**Compliance warning on manual add (Item 18):**
- Show modal warning when using "Add Client" directly
- Require acknowledgment that EL/AML/onboarding will need to be completed
- Log this bypass in audit trail

**Unique email enforcement (Item 19):**
- Add UNIQUE constraint on `clients(email, organization_id)`
- Prevent same email appearing twice within an org
- Show clear error message on duplicate attempt

### 2D. Client detail fields (Items 21-29)

**Limited company SIC code + director contacts (Item 21):**
- `companies.sic_codes` already exists (JSONB). Surface in CompanyDetail UI
- Director contacts: add UI to link existing clients as directors or add manual director contacts
- When director is an existing SA client, pull NINO/UTR/DOB/address from their client record

**LLP Companies House + partnership UTR + partners (Item 22):**
- LLP uses `companies` table. CH lookup already works
- Add `partnership_utr` field to companies table for LLP type
- Add partner contacts UI (same pattern as directors)

**Director/partner contact fields (Items 23, 25):**
- Add columns to `contacts` table: `nino, utr, date_of_birth, address JSONB, nationality, ch_personal_code`
- Migration to add these columns
- Update contact forms to show these fields for Director/Partner roles

**Partnership details (Item 24):**
- `client_detail_partnership` already has `partnership_utr`, `partners JSONB`
- Add `partnership_year_end` and `tax_year` fields
- Add minimum 2 contacts validation in UI
- Year end triggers automation for partnership tax return jobs

**CGT deadline auto-calculation (Item 26):**
- `client_detail_cgt` already has `disposal_date`
- Add `completion_date` column if not same as `disposal_date`
- Auto-calculate deadline = completion_date + 60 days
- One-off service: mark as completed when done
- Fees persist in firm earnings even when client/service inactive

**Charity missing fields (Item 27):**
- `client_detail_charity` already has: charity_number, charity_status, trading_as, charity_year_end, gift_aid_claim_expiry
- Add: `incorporation_date`, `charity_commission_submission_due`

**Engagement letter last signed date (Item 28):**
- Surface on all client profile pages from onboarding/engagement letter records
- Query latest signed EL and show date prominently

**Partner/staff in charge on all clients (Item 29):**
- Add `partner_in_charge UUID` and `staff_in_charge UUID` to `clients` table
- Companies already have these. Now individuals get them too
- Show on all client detail views

### 2E. HMRC authorisation UI (Item 30)

- Build `HmrcAuthorisationPanel` component
- `hmrc_authorisations` table already exists with: auth_type, status, authorised_at, expires_at
- Add `requested_at DATE` and `code_entered_at DATE` columns
- Supported auth types: self_assessment, corporation_tax, paye, cis
- Accountant requests via UI → `requested_at` set
- Accountant manually enters date code was entered → `code_entered_at` set
- Per-client tracking visible on client detail and company detail pages
- Statuses: not_started, requested, authorised, expired

### 2F. Services verification and features (Items 31-35)

**Verify 14 services (Item 31):**
Current seeded: CT600, SA-RETURN, VAT-RETURN, BK-MONTHLY, BK-ANNUAL, PAYROLL, CONFIRM-STMT, ANNUAL-ACC, TAX-PLAN, COMPANY-SETUP
Missing from required 14: CIS, MTD-QUARTERLY, MTD-FINAL-DEC, REGISTERED-ADDR, ADVISORY, SOFTWARE, CGT-RETURN
- Add missing services via INSERT

**Quote-to-service mapping verification (Item 32):**
- Verify quote acceptance populates engagements with correct service_id and fee
- Test end-to-end flow

**Service-specific fields toggle (Item 33):**
- When service toggled OFF: clear associated data, stop reminders/automations
- When toggled ON: show relevant fields (PAYE: employer ref, accounts office ref; VAT: VAT number, quarters; Pension: provider, auto-enrolment staging)
- Clearing on toggle-off must be confirmed by user

**EL re-sign on fee/service change (Item 34):**
- Detect changes to engagements (fee amount, service added/removed)
- Auto-create draft engagement letter
- Queue signature request to client
- Record old vs new scope

**Aggregated fee totals (Item 35):**
- Show total monthly recurring, total one-off fees on client services section
- Show firm-wide totals on dashboard

### 2G. Jobs status alignment (Item 36)

Current statuses match the canonical list exactly: blank, records_requested, records_received, accountant_queries, client_queries, accountant_review, client_review, ready_to_file, completed. **Already aligned — no change needed.**

### 2H. Questionnaire → job status (Item 37)

- When questionnaire is completed, update linked job status to `records_received`
- Wire into `questionnaire-workpaper-service.ts`

### 2I. Payroll journal mapping (Item 38)

- On payroll setup, accountant maps payroll items to CoA accounts
- Store mapping in `payroll_journal_mapping` table: `org_id, company_id, payroll_item (gross_wages|employer_nic|employee_nic|paye|pension_employee|pension_employer|net_pay), debit_account_id, credit_account_id`
- When pay run is approved, auto-generate journal using this mapping
- Journal created as DRAFT for accountant approval before posting
- Default CoA should be AOS standard chart

---

## Wave 3: Filing Completion (separate wave)

Items not covered above (CT600 completion, MTD ITSA) remain as previously planned — verified and completed in a separate wave after Waves 1-2.

---

## Migration Summary

### Schema changes needed:
1. `organization_users` role constraint → `('owner', 'staff', 'admin')`
2. `contacts` table: add `nino, utr, date_of_birth DATE, address JSONB, nationality, ch_personal_code`
3. `clients` table: add `partner_in_charge UUID, staff_in_charge UUID`
4. `client_detail_charity`: add `incorporation_date DATE, charity_commission_submission_due DATE`
5. `client_detail_partnership`: add `partnership_year_end INTEGER, tax_year TEXT`
6. `client_detail_cgt`: add `completion_date DATE, deadline_date DATE`
7. `companies`: add `partnership_utr TEXT` (for LLP)
8. `hmrc_authorisations`: add `requested_at DATE, code_entered_at DATE`
9. New table: `bookkeeping_audit_log`
10. New table: `lead_activities`
11. New table: `payroll_journal_mapping`
12. Migrate `sole_trader`/`landlord` values to `sa_non_mtd` in leads and clients
13. Migrate `manager`/`viewer` roles to `staff`/`admin` in organization_users
14. INSERT missing services into `services_catalog`
15. Add UNIQUE constraint on `clients(email, organization_id)`
16. Rewrite all RLS policies for 3-role model
17. Create SECURITY DEFINER functions for org membership management

### Files changed (major):
- `src/lib/permissions.ts` — full rewrite
- `src/lib/client-types.ts` — remove sole_trader/landlord
- `src/lib/auth-context.tsx` — add idle timer
- `src/lib/organization-context.tsx` — update role type
- `src/hooks/usePermissions.ts` — update types
- `src/components/ui/permission-guard.tsx` — update types
- `src/pages/Overview.tsx` — role-scoped dashboard
- `src/components/dashboard/DashboardKPICards.tsx` — add leads + revenue cards
- `src/components/dashboard/RevenueCards.tsx` — new component
- `src/components/crm/LeadDetailPanel.tsx` — quote management, activity log
- `src/components/clients/HmrcAuthorisationPanel.tsx` — new component
- `src/components/clients/AddClientDialog.tsx` — compliance warning
- `src/components/contacts/ContactForm.tsx` — new fields
- `src/lib/lead-conversion-service.ts` — auto-won logic, double conversion guard
- `src/lib/job-status-service.ts` — questionnaire completion hook
- `supabase/functions/_shared/permissions.ts` — 3-role rewrite
- `supabase/functions/_shared/auth.ts` — role validation update
- New: `supabase/functions/gdpr-data-export/index.ts`
- New: `supabase/functions/gdpr-data-deletion/index.ts`

### Delivery order:
1. Role model migration + RLS rewrite + permission rewrite (foundational — everything depends on this)
2. Session security (idle timeout + concurrent session limits)
3. Audit trail enhancements (bookkeeping audit, sensitive events)
4. Client type cleanup (remove sole_trader/landlord)
5. Client detail field additions (contacts, partnerships, charity, CGT, HMRC auth)
6. CRM consolidation (quotes in CRM, activity logging, auto-won, double conversion)
7. Dashboard updates (KPI cards, revenue, role-scoped views)
8. Services verification and fee engine (missing services, toggle logic, EL re-sign)
9. Questionnaire → job status wiring
10. Payroll journal mapping
11. GDPR export/deletion
12. Manual client add compliance warning + email uniqueness

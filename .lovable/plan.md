
# AccountancyOS — Full Implementation Plan (38 Points)

## Wave 1 — Hard Blockers (Security & Role Model)

### Step 1: Collapse to 3-Role Model (Points 7, 10, 20)
**Migration:**
- Drop CHECK constraint `organization_users_role_check`
- UPDATE any `manager` or `viewer` rows to `staff` (currently only `owner` exists, so no data change)
- Add new CHECK: `role IN ('owner', 'admin', 'staff')`
- Drop `app_role` enum if it exists, recreate with only 3 values

**Frontend (`src/lib/permissions.ts`):**
- Change `AppRole` to `'owner' | 'staff' | 'admin'`
- Rewrite `PERMISSIONS` mapping with privilege order: owner > staff > admin
  - **Owner**: all permissions
  - **Staff**: all operational permissions (jobs, clients, filings, emails, bookkeeping, workpapers, documents, conversations, deadlines, questionnaires)
  - **Admin**: read-only + basic admin tasks only. NO manage_team, billing, services, fees, automations, templates, filings authority, integrations, or firm settings
- Change `ROLE_HIERARCHY` to `['admin', 'staff', 'owner']`
- Update `getRoleLabel`: owner=Owner, staff=Staff, admin=Admin
- Remove all `manager` and `viewer` references

**Other files to update:**
- `src/pages/settings/PermissionsSettings.tsx` — remove manager/viewer from ROLE_CONFIG
- `supabase/functions/_shared/permissions.ts` — mirror 3-role model
- `src/hooks/usePermissions.ts` — no structural change needed, just type alignment
- `src/components/ui/permission-guard.tsx` — type alignment
- `src/lib/permission-service.ts` — type alignment

### Step 2: Lock Down organization_users (Point 6)
**Migration:**
- Drop existing INSERT policy `Safe org membership insert`
- Create SECURITY DEFINER function `accept_org_invitation(invitation_id UUID)` that:
  - Validates invitation exists, is pending, and matches `auth.uid()` email
  - Inserts into `organization_users` with the invited role
  - Marks invitation as accepted
- Create SECURITY DEFINER function `add_org_member(org_id UUID, target_user_id UUID, target_role TEXT)` that:
  - Validates caller is owner/admin of the org
  - Validates target_role is valid and not higher than caller's role
  - Inserts into organization_users
- New INSERT RLS policy: `USING (false)` — block ALL direct inserts
- Keep existing UPDATE policy but add: staff cannot change roles (only owner can)
- Add trigger: prevent role escalation — cannot set role higher than own role

### Step 3: 10-Minute Inactivity Timeout (Point 1)
**`src/lib/auth-context.tsx`:**
- Add idle timer (10 minutes = 600,000ms)
- Track mouse, keyboard, scroll, touch events
- On timeout: call `signOut()`, redirect to `/auth`
- Reset timer on any activity
- Works for both accountant and client users

### Step 4: Concurrent Session Limits (Point 2)
**Migration:**
- Add `max_sessions` column to `organizations` or use subscription plan lookup
- Plan-based limits: Solo=1, Studio=4, Firm=10

**`src/lib/auth-context.tsx`:**
- On login, register session in `user_sessions` table
- Check active session count for org against plan limit
- If at limit, reject login with clear message OR invalidate oldest session

### Step 5: Session Audit History (Point 3)
- `user_sessions` table already has: ip_address, user_agent, last_activity_at, invalidated_at, invalidated_reason — confirmed sufficient
- **Bookkeeping audit**: Create `bookkeeping_audit_log` table with columns: id, organization_id, user_id, entity_type (transaction/invoice/bill/journal/payment), entity_id, action (categorize/uncategorize/create/void/approve/reverse), details (JSONB), created_at
- Add audit logging calls in all bookkeeping mutation functions

### Step 6: Sensitive Event Auditing (Point 4)
- Extend existing `audit_log` usage to explicitly track: login, password_reset, invitation_accepted, role_change, mailbox_connect, hmrc_connect, document_signed, filing_submitted
- Each entry: user_id, timestamp, action, details JSONB
- Client-side updates also tracked with client user_id and timestamp

### Step 7: GDPR Export & Deletion (Point 5)
- Create edge function `gdpr-export` — exports all PII for a given client as JSON
- Create edge function `gdpr-delete` — anonymizes/deletes client PII across all tables
- Both require owner role
- Add UI button in client settings

---

## Wave 2 — Core Operational Spine

### Step 8: Remove sole_trader and landlord (Point 13)
- Update `src/lib/client-types.ts`: remove `sole_trader` and `landlord` from CLIENT_TYPES array
- Migration: UPDATE clients SET client_type = 'sa_non_mtd' WHERE client_type IN ('sole_trader', 'landlord')
- Same for leads table

### Step 9: CRM — Quote/Pipeline in CRM (Point 14)
- Move "Send Quote" button into CRM lead detail panel
- Quote creation/tracking accessible directly from lead detail
- Keep Quotes page as secondary read-only view

### Step 10: CRM — Pipedrive-style Activity Logging (Point 15)
- Add `lead_activities` table: id, lead_id, organization_id, user_id, activity_type (call/email/meeting/note), description, created_at
- Show activity timeline on lead detail
- Last activity date drives reminders and automation triggers

### Step 11: Auto-conversion on Portal Signup (Points 16, 17)
- Lead moves to "Won" automatically when: engagement letter signed AND portal login created
- Guard against double conversion: check `converted_at` before converting
- Conversion is idempotent — second trigger is a no-op

### Step 12: Manual Add Client Compliance Warning (Point 18)
- Show warning dialog when using "Add Client" directly
- Warn that this bypasses engagement letter and onboarding workflow
- Require confirmation and log the bypass in audit_log

### Step 13: Unique Email Enforcement (Point 19)
- Add UNIQUE constraint on client email within organization
- Check on client creation and lead conversion
- Show clear error if duplicate detected

### Step 14: Client Detail Fields (Points 21-29)
**Contacts table migration:**
- Add columns: nino, utr, dob (date), address (text), nationality, ch_personal_code

**Limited company (Point 21):**
- Show SIC code field (from CH data or manual)
- Director contacts linked — if director is existing client, allow selection and data pull

**LLP (Point 22):**
- Pull data from CH API (already wired)
- Add partnership_utr field to companies
- Partner contacts linked — same client-selection logic as directors

**Partnership (Points 24, 25):**
- Add partnership_utr to client_detail_partnership
- Add partnership_year_end, tax_year fields (trigger automations)
- Minimum 2 contacts validation
- Partner contacts: name, address, DOB, NINO, UTR

**CGT (Point 26):**
- Add cgt_number, completion_date to client_detail_cgt
- Auto-calculate deadline = completion_date + 60 days
- Mark as one-off — switch off when completed
- Fees remain in firm earnings even when inactive

**Charity (Point 27):**
- Add charity_status, incorporation_date, charity_commission_due to client_detail_charity

**Engagement letter date (Point 28):**
- Surface last EL signed date on all client profiles

**Partner/staff in charge (Point 29):**
- Add partner_in_charge, staff_in_charge to clients table
- Display on all client detail views

### Step 15: HMRC Authorisation UI (Point 30)
- Build `HmrcAuthorisationPanel` component
- Shows per-client: SA, CT, PAYE, CIS auth status
- Fields: application_date (auto-set on submit), code_entered_date (manual input)
- Track on per-client/per-service basis
- Surface on client detail page

### Step 16: Verify/Seed 14 Services (Point 31)
Required services vs current:
- Accounts ✓ (ANNUAL-ACC)
- CT600 ✓
- Confirmation Statement ✓ (CONFIRM-STMT)
- Bookkeeping ✓ (BK-MONTHLY/BK-ANNUAL)
- VAT Return ✓ (VAT-RETURN)
- Payroll ✓ (PAYROLL)
- **CIS** — MISSING, add
- **MTD Quarterly Filing** — MISSING, add
- **MTD Final Declaration** — MISSING, add
- **Registered Address** — MISSING, add
- **Advisory** — MISSING, add
- **Software** — MISSING, add
- **CGT Return** — MISSING, add
- SA Return ✓ (SA-RETURN)
- Remove duplicates (code 6930)

### Step 17: Quote-to-Service Mapping Verification (Point 32)
- Trace quote acceptance → engagement creation → service assignment
- Verify fees flow through correctly
- Fix any gaps

### Step 18: Service-Specific Conditional Fields (Point 33)
- When service toggled on: show PAYE/VAT/Pension fields
- When toggled off: clear data, stop reminders
- PAYE: employer_ref, accounts_office_ref, tax_year, rti_deadline, pension_declaration_date
- VAT: vat_number, vat_quarters, member_state, registration_date, effective_date
- Pension: provider, number, auto_enrolment_staging

### Step 19: EL Re-sign on Fee/Service Change (Point 34)
- Detect fee or service scope changes
- Auto-draft updated engagement letter
- Queue signature request
- Record old vs new scope

### Step 20: Fee Totals UI (Point 35)
- Show aggregated: total monthly recurring, total one-off, by service type
- Display on client services tab

### Step 21: Job Status Alignment (Point 36)
- Canonical statuses: Blank, Records Requested, Records Received, Accountant Queries, Client Queries, Accountant Review, Client Review, Ready to File, Completed
- This matches current DB — confirm alignment and update any UI labels

### Step 22: Questionnaire → Job Status (Point 37)
- On questionnaire completion, auto-update linked job to "Records Received"
- Verify `questionnaire-workpaper-service.ts` handles this

### Step 23: Auto-Generated Payroll Journals (Point 38)
- Create `payroll_journal_mapping` table: org_id, payroll_component (gross_pay, employer_ni, pension, paye, net_pay), debit_account_id, credit_account_id
- On payroll setup, accountant maps components to CoA accounts
- On pay run completion, auto-draft journal for accountant approval
- Default CoA is AOS standard chart

---

## Wave 3 — Practice Usability

### Step 24: Dashboard KPI Cards (Points 8, 11)
- Add "Total Leads" count card
- Add "Current Firm Revenue" card (sum of active service fees)
- Add monthly/one-off fee split
- Add pipeline revenue (from active quotes)
- Add "Top Revenue Service" indicator

### Step 25: Role-Scoped Dashboard (Point 12)
- Owner: full firm view, all KPIs, staff variance
- Staff: "My Jobs", "My Clients", "My Overdue" filtered view
- Admin: read-only summary view

### Step 26: SLA-tied Overdue Actions (Point 9)
- Verify SLA instances created for email response, message response, job updates
- Accountant can manually update SLA status
- Practice-wide SLA settings drive auto-creation
- Feed overdue counts to dashboard

---

## Wave 4 — Filing Completion
- CT600 end-to-end verification
- MTD ITSA REST pathway build
- VAT/payroll filing verification

## Wave 5 — Final Hardening
- Billing tab rationalisation
- Settings/automation controls
- Full regression pack

---

## Execution Order
1. Migration: 3-role collapse + org_users lockdown + contacts fields + new tables
2. Frontend: permissions.ts rewrite + all role references
3. Auth: idle timeout + concurrent sessions
4. Audit: bookkeeping audit log + sensitive event tracking
5. GDPR edge functions
6. Client types cleanup + CRM consolidation
7. Client detail fields UI
8. Services seeding + conditional fields
9. Job status + questionnaire wiring + payroll journals
10. Dashboard cards + role scoping
11. Filing verification
12. Regression testing

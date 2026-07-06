# AccountancyOS Operational Workflow Audit & Implementation Brief

## Role

You are Claude Code acting as a senior product engineer, security engineer, and accounting-practice workflow architect for AccountancyOS.

AccountancyOS is not a generic practice-management tool. It is intended to become the operating system for UK accountancy practices, where the full lifecycle runs through one connected data spine:

`Lead → Quote → Engagement Letter → Onboarding → Client Portal → Services → Jobs → Questionnaires → Records Received → Workpapers → Review → Client Approval → HMRC / Companies House Filing → Completion → Rollover`

Your job is to audit the existing repository, identify what already exists, and implement the missing or broken workflow logic without creating parallel systems, placeholder features, or cosmetic-only UI changes.

This must be treated as a production-grade implementation brief.

---

## Non-Negotiables

1. **Reconnaissance first.** Do not write code until you have inspected the current schema, RLS policies, edge functions, services, pages, components, migrations, and existing domain models.
2. **Do not create duplicate architecture.** Extend the existing AccountancyOS tables, services, RPCs, and edge functions unless there is a clear technical reason not to.
3. **No placeholders.** Do not add buttons, states, tabs, fields, or workflows unless they are wired to real database-backed functionality.
4. **No frontend-only truth.** Business-critical status changes must be enforced server-side through database constraints, RPCs, edge functions, or transactional service methods.
5. **Respect RLS and organisation isolation.** Every new query, RPC, edge function, storage interaction, and policy must be organisation-scoped and secure.
6. **Accountant-led model.** AccountancyOS is sold to accountancy practices. Clients access the portal through their accountant. Clients must not submit filings directly.
7. **Job-centric operating model.** Services create jobs. Jobs drive questionnaires, records requests, automations, workpapers, deadlines, filing, completion, and rollover.
8. **Engagement-letter protection.** Any material service or fee change must trigger a new engagement letter / terms signature workflow before the changed service package is treated as fully active.
9. **Audit everything important.** Uploads, signatures, status changes, quote acceptance, job transitions, document visibility changes, filing locks, and service/fee amendments need audit history.
10. **Ask clarifying questions before irreversible architectural changes.** If a decision would materially affect the product architecture, stop and ask. Otherwise, make sensible implementation decisions consistent with the existing codebase.

---

## Current Business Intent

The product must support how real small UK accountancy practices operate.

A client is not just a row in a CRM. A client is engaged for one or more services. Each active service creates recurring or one-off jobs. Each job has deadlines, automation, questionnaires, records, workpapers, review steps, approvals, filings, and completion logic.

The product should reduce tool sprawl by replacing disconnected systems for CRM, onboarding, engagement letters, client portal, deadlines, records chasing, documents, bookkeeping, workpapers, filings, automations, conversations, and practice visibility.

---

## Initial Reconnaissance Tasks

Before changing anything, inspect and report on the following:

### Repository / App Structure

- React routes and page structure.
- Client portal routes versus accountant app routes.
- Existing client, lead, quote, service, job, deadline, document, questionnaire, workpaper, automation, filing, billing, and conversation components.
- Shared hooks and service files.
- Existing Supabase client wrappers.
- Existing edge functions and RPC usage.

### Database / Supabase

Inspect:

- Existing migrations.
- Tables related to:
  - organisations / practices
  - users / staff
  - leads
  - quotes
  - clients
  - contacts
  - services
  - jobs
  - deadlines
  - documents
  - signatures
  - questionnaires
  - templates
  - workpapers
  - filings
  - conversations / emails / messages
  - automations
  - billing / fees
  - audit logs
- RLS helper functions.
- Existing RLS policies.
- SECURITY DEFINER functions.
- Storage buckets and storage policies.

### Existing Workflow Reality

Produce a written audit covering:

1. What already works.
2. What exists but is incorrectly wired.
3. What exists as UI only.
4. What is missing entirely.
5. What is unsafe or not production-ready.
6. What would create duplicate / conflicting product logic if implemented naively.

Do not proceed to implementation until this audit is complete.

---

## Product Model To Enforce

### Core Data Spine

The system should operate around this hierarchy:

```text
Organisation / Practice
  → Staff Users
  → Leads
    → Quotes
      → Accepted Quote
        → Client
          → Contacts
          → Engagement Letter / Terms
          → Services
            → Jobs
              → Deadlines
              → Automations
              → Questionnaires
              → Records
              → Workpapers
              → Reviews
              → Filings
              → Completion / Rollover
```

### Client Types

Lead type and client type must use the same controlled list so CRM data flows cleanly into the client record.

Required client types:

- Self-assessment (non MTD)
- Self-assessment (MTD)
- Partnership
- Limited Liability Partnership
- Limited company
- Capital gains tax return
- Other
- Charity

These should be implemented as a controlled enum or lookup table, not free text.

---

## Phase 1 — Security, Session, and GDPR Hardening

### 1.1 Auto Logout

Implement configurable inactivity-based auto logout.

Requirements:

- Organisation-level setting for inactivity timeout.
- Default sensible timeout if none configured.
- Applies to accountant users and portal users.
- Warning modal before logout if feasible using existing UI patterns.
- Server-side session validity must still rely on Supabase auth, but frontend must clear local auth state and redirect appropriately.
- Do not break normal refresh / tab behaviour.

Acceptance criteria:

- User inactive beyond configured period is logged out.
- Active user is not logged out.
- Accountant and portal users are redirected to the correct login route.
- Setting is persisted and organisation-scoped.

### 1.2 Concurrent Session Control

Investigate and implement a safe option for limiting users to one active device/session if compatible with Supabase auth architecture.

Requirements:

- Add an organisation-level security setting: allow multiple sessions yes/no.
- If disabled, newest login should invalidate older app-level sessions.
- Do not attempt unsafe manipulation of Supabase internals.
- Use an app-level session registry if needed.
- Must work separately for accountant users and portal users.
- Must not accidentally log out all users in an organisation.

Acceptance criteria:

- When single-session mode is enabled, login on a second device invalidates the first app session.
- When disabled, multiple sessions work normally.
- Behaviour is tested for accountant and portal users.

### 1.3 GDPR / Security Review

Audit existing GDPR/security posture and implement obvious missing controls.

At minimum check:

- RLS coverage.
- Storage bucket policies.
- Cross-organisation data leakage.
- Audit log coverage.
- Data retention hooks.
- Document archive handling.
- Deletion / soft deletion patterns.
- Access revocation for portal users.
- Sensitive field exposure in frontend queries.

Do not implement broad legal-policy text. Implement concrete technical controls only.

---

## Phase 2 — Overview / Practice Dashboard Rebuild

The current overview page should become a practical practice dashboard.

### Remove / Adjust Existing UI

- Notifications must be clearable.
- Remove emojis and exclamation marks from professional UI copy.
- Setup progress tasks must be skippable.
- Remove the “Next Steps” section entirely.
- Keep Quick Actions unless broken.

### Required Dashboard Sections

Build or wire the overview dashboard to show:

1. Upcoming deadlines.
2. Overdue deadlines.
3. Overdue action points.
4. Conversations awaiting reply.
5. Emails awaiting reply.
6. Tasks requiring action.
7. Total clients.
8. Total leads.
9. Current firm revenue.
10. Lead revenue from open quotes.

### Deadline Logic

Dashboard deadlines must come from the deadline/job/service model, not hardcoded frontend arrays.

Each deadline item should show:

- Client.
- Service.
- Job if applicable.
- Deadline type.
- Due date.
- Status.
- Responsible staff member / partner if available.

### SLA Logic

Overdue actions, conversations, and emails should be driven by internal SLA settings where those exist.

If SLA settings do not exist, create a minimal, production-grade SLA model rather than hardcoding arbitrary overdue logic.

### Role Visibility

Practice owner / admin:

- Can see firm-wide data.

Staff member:

- Can see their own assigned clients, jobs, tasks, conversations, and deadlines unless current app permissions already define broader access.

Acceptance criteria:

- Overview is useful immediately to a small practice owner.
- No fake metrics.
- No unscoped cross-organisation data.
- Revenue metrics come from accepted clients/services and open quotes.

---

## Phase 3 — CRM and Quote Workflow

### 3.1 Lead Type Continuity

Lead type must use the same options as client type.

Implement:

- Dropdown controlled by shared client-type enum / lookup.
- Migration from any existing free-text values where necessary.
- Validation on insert/update.

### 3.2 Companies House Integration at CRM Stage

For relevant entity types, the CRM should allow Companies House lookup / pull-in.

Relevant types:

- Limited company
- LLP
- Charity where Companies House data is available

Pulled data should be persisted on the lead and flow into the client record when won.

Data to pull where available:

- Company name.
- Company number.
- Incorporation date.
- Registered office address.
- SIC codes.
- Accounts due date.
- Confirmation statement date.
- Directors / officers if existing integration supports it.

Do not build a mock Companies House integration. Use the existing integration if present. If only sandbox/mock exists, document this as a blocking production issue and do not pretend it is complete.

### 3.3 Quote Flow from CRM

Add or repair a “Send Quote” action from CRM.

The CRM should support both:

- Create Lead.
- Send Quote directly from CRM for inbound calls or direct enquiries.

Assess whether the existing Quotes page should remain as a management view or whether CRM already provides the right quote management UX. Do not remove the Quotes page without explicit approval.

### 3.4 Lead Stage History

Every movement through CRM stages must create history.

Track at minimum:

- Date/time moved to each stage.
- User who moved it.
- Whether moved manually or by automation.
- Related quote / email / automation if applicable.

Stages should support automation triggers.

### 3.5 Chasing State

Define clear behaviour for quote chasing.

Requirements:

- A lead enters chasing when the first automated quote chaser is queued/sent, or when manually moved to chasing.
- Manual movement must not silently cancel queued emails.
- Queued emails should remain visible and cancellable.
- Lead detail view must show email/chaser history.

### 3.6 Won Lead → Client Creation

A lead should become a client only through the proper acceptance/onboarding flow.

Expected flow:

1. Quote accepted.
2. Engagement letter / terms issued.
3. Engagement letter / terms signed.
4. Client record created or activated from the lead data.
5. Services and fees from quote are created under the client.
6. Jobs are created from those services.
7. Onboarding tasks continue.

Do not allow “Won” to create an active client without legal/onboarding safeguards unless the existing product explicitly marks such clients as draft/pending.

### 3.7 Qualified Column

Review whether the Qualified column is necessary. If the current UX is too fiddly for small firms, propose simplifying the pipeline by removing or hiding it. Do not remove it without approval.

Acceptance criteria:

- Lead and client type are aligned.
- Quote history is visible from lead detail.
- Lead stage history is persisted.
- Accepted quote can generate the correct client, services, fees, and jobs.
- No client is fully active without the required engagement-letter state.

---

## Phase 4 — Client Record and Portal Model

### 4.1 Add Client Button Review

Audit whether “Add Client” currently allows bypassing CRM, quote, engagement letter, and onboarding.

Preferred behaviour:

- New business should normally enter through CRM/prospect route.
- Direct client creation, if retained, must create a restricted “draft/pending onboarding” client, not a fully active client.
- Directly added clients must still require engagement letter completion before work can proceed.

Acceptance criteria:

- No legal/commercial bypass exists.
- Direct-add route is either removed, restricted, or made safe.

### 4.2 Client List

Client list must show:

- Client name.
- Client type.
- Active services.
- Partner in charge.
- Staff in charge.
- Last engagement letter signed date.
- Onboarding/status state.

### 4.3 Client Details by Type

Implement or audit structured detail tabs by client type.

#### Limited Company

Fields:

- Company name.
- Company number.
- Incorporation date.
- Year-end date.
- Trading status.
- UTR.
- SIC code.
- Registered address.
- Trading address.
- Director name.
- Preferred name.
- Director DOB.
- Director address.
- Director NINO.
- Director UTR.
- Director Companies House personal code.
- Director nationality.
- Partner in charge.
- Staff in charge.
- Internal reference.
- Authentication code.
- Accounts due date.
- CT600 due date.
- Corporation tax payable date.

Where possible, Companies House fields should populate from the Companies House API.

#### LLP

Fields:

- LLP name.
- LLP number.
- Incorporation date.
- Year-end date.
- Registered address.
- Trading address.
- UTR.
- Partner/member details.
- Corporate member support where current data model permits.
- Partner in charge.
- Staff in charge.
- Internal reference.
- Authentication code.
- Accounts due date.
- Tax return deadline.

Use nominated contacts where full partner modelling is not yet safe.

#### Partnership

Fields:

- Partnership name.
- Partnership UTR.
- Partnership address.
- Minimum two partners.
- Partner name.
- Partner DOB.
- Partner UTR.
- Partner NINO.
- Partner address.
- Partner in charge.
- Staff in charge.

#### Self-Assessment Non-MTD

Fields:

- Individual name.
- Preferred name.
- DOB.
- UTR.
- NINO.
- Address.
- Mobile number.
- Email.
- Companies House personal code only if linked to a company client.
- Partner in charge.
- Staff in charge.

#### Self-Assessment MTD

Same as non-MTD plus:

- MTD income source types.
- MTD quarterly obligation schedule.
- MTD final declaration deadline.
- HMRC authorisation status.

#### Capital Gains Tax Return

Fields:

- Individual name.
- NINO.
- CGT account/reference number.
- Home address.
- Property sold address.
- Completion date.
- CGT filing deadline.
- CGT payment amount.
- CGT payment deadline.

#### Charity

Fields:

- Charity name.
- Charity number.
- Charity status.
- Incorporation date if applicable.
- Trading/as name.
- Charity accounts year end.
- Charity Commission submission due date.
- Companies House accounts due date if applicable.
- CT600 requirement indicator.

Acceptance criteria:

- Fields are type-aware.
- Irrelevant fields do not show for irrelevant client types.
- Existing data is preserved.
- API-pulled data is not duplicated inconsistently.

---

## Phase 5 — HMRC Authorisations

Audit where HMRC authorisations currently live.

Implement or expose authorisation status for:

- Self Assessment.
- MTD Income Tax.
- Corporation Tax.
- PAYE.
- VAT.
- CIS where relevant.

Client pages should clearly show:

- Authorisation required.
- Authorisation requested.
- Authorised.
- Failed / expired / revoked.
- Date requested.
- Date authorised.
- HMRC service covered.

Do not fake HMRC authorisation. If the app does not yet integrate with HMRC for a given service, show the production gap honestly in the audit.

---

## Phase 6 — Services and Fees

### 6.1 Standard Service Catalogue

Standard services should be pre-populated and managed centrally.

Required standard services:

- Accounts
- CT600
- Confirmation statement
- Bookkeeping
- VAT return
- Payroll
- CIS
- MTD quarterly filing
- MTD final declaration
- Registered address
- Advisory
- Software
- Capital gains tax return
- Self-assessment tax return

These should live in the service catalogue / settings area, not as hardcoded UI options.

### 6.2 Client Services Tab

Each client should have a Services tab showing:

- Active services.
- Inactive services.
- Service fee.
- Fee type: one-off or monthly.
- Start date.
- End date if applicable.
- Linked jobs.
- Last engagement letter coverage.

Services accepted from a proposal should appear automatically with the accepted fee.

### 6.3 Fee Changes

Fees must be adjustable at client-service level.

Changing any of the following should trigger engagement-letter refresh:

- New service added.
- Service removed.
- Fee changed.
- Fee frequency changed.
- Material terms changed.

Until the new engagement letter is signed, the changed service package should be marked pending and should not be silently treated as fully agreed.

### 6.4 Service-Specific Fields

When specific services are active, show additional fields.

#### PAYE

- Employer PAYE reference.
- Accounts office reference.
- Tax year.
- RTI deadline logic.
- Pension declaration date.

#### Pension / Auto-Enrolment

- Pension provider.
- Pension number.
- Auto-enrolment staging / duties start date.

#### VAT

- VAT number.
- VAT quarter stagger.
- VAT member state / country.
- Date of registration.
- Effective date.
- VAT authorisation status.

Acceptance criteria:

- Services drive jobs and deadlines.
- Fees flow into billing/revenue reporting.
- Service/fee changes trigger engagement-letter workflow.

---

## Phase 7 — Jobs as the Operational Centre

Jobs are the core operating object.

### 7.1 Job Creation

Jobs should be created from active services.

Examples:

- Limited company assistance creates company accounts and CT600 jobs.
- Self-assessment service creates annual tax return job.
- VAT service creates VAT return jobs per VAT period.
- Payroll service creates recurring payroll/RTI jobs.
- MTD ITSA creates quarterly filing jobs and final declaration job.
- CGT service creates one-off CGT return job.

### 7.2 Job Status Model

Implement or align to the following lifecycle:

```text
Not started
Records requested
Records received
Records verified
In progress
Internal review
External/client review
Client approved
Filed/submitted
Accepted
Completed
Rolled over
```

Use existing statuses where possible, but map them clearly.

### 7.3 Questionnaire → Job Progression

When a client completes and submits a questionnaire linked to a job:

- Questionnaire status becomes completed.
- Completion date is recorded.
- Job status updates to Records received.
- Relevant staff/partner notification is created.
- Automation chasers for records should stop.

### 7.4 Records Verified → Workpaper Creation

When the accountant marks records as verified:

- Job status updates to Records verified.
- Workpaper creation is triggered where applicable.
- Job then progresses to In progress once workpaper exists or work starts.

### 7.5 Review / Approval / Filing / Completion

Expected flow:

1. Internal review.
2. External/client review where applicable.
3. Client approval.
4. Filing submitted to Companies House/HMRC where applicable.
5. Filing accepted.
6. Job marked completed.
7. New job rolled over for next period/year if recurring.

### 7.6 Rollover

Recurring jobs must roll over based on service and period rules.

Examples:

- Annual accounts and CT600 roll over to next accounting period.
- Self-assessment rolls over to next tax year.
- VAT rolls over to next VAT quarter.
- Payroll rolls over by payroll period/month.
- MTD quarterly filings roll over by quarter.

Acceptance criteria:

- Jobs are not isolated task cards.
- Jobs are linked to service, client, deadlines, questionnaires, workpapers, automations, and filings.
- Questionnaire completion updates job state.
- Filing acceptance can complete and roll over jobs.

---

## Phase 8 — Conversations and Communications

The Conversations page should be the communication history across:

- Emails between client and accountant.
- In-app messages between client and accountant.
- Internal messages between staff/partner.

### Requirements

- Messages can be tagged to a job.
- Messages can be tagged to a client.
- Messages can be internal or external.
- Where multiple contacts exist, correspondence defaults to the primary contact.
- Accountant users can respond to email from within AccountancyOS using the existing email provider integration if available.
- Conversations should show response-time SLA state.
- Overdue responses should surface on the Overview dashboard.
- Conversations should be grouped under the Conversations header by tag/job.
- Conversations can be archived.
- Active/Archived filter should persist per user.

Acceptance criteria:

- Accountants can work from AccountancyOS rather than needing to return to Gmail/Outlook for normal client replies where integration exists.
- SLA overdue logic is visible and dashboard-backed.
- Job-tagged conversations create useful work history.

---

## Phase 9 — Documents and Signature Workflow

### 9.1 Document Upload

At upload, accountant must be able to set:

- Client visible on/off.
- Signature required on/off.
- Related client.
- Related job where applicable.
- Related service where applicable.

Clients must be able to upload documents through the portal.

### 9.2 Document Management

From the document list, accountant should be able to:

- Toggle signature required.
- Toggle client visible.
- Delete multiple documents at once.
- Archive documents.
- Filter by client/job/service/status.

### 9.3 Auto Archive

Documents should auto-archive to an Archived state/folder after 7 years from upload date.

Do not physically delete documents as part of this requirement.

### 9.4 Audit History

Track:

- Who uploaded.
- Upload timestamp.
- Visibility changes.
- Signature-required changes.
- Who signed.
- Signature timestamp.
- Who deleted/archived.
- Delete/archive timestamp.

### 9.5 Signature Behaviour

Signature requirements:

- Client must scroll through the uploaded document before signature input becomes enabled.
- Signature input is greyed out before scroll completion.
- Signed version is auto-saved.
- Signed version includes signature, date, and timestamp.
- Signature evidence is preserved in audit log.

Acceptance criteria:

- Document signing is legally safer than a simple checkbox.
- Signed files are preserved separately from unsigned originals or with clear version history.
- Audit trail is complete.

---

## Phase 10 — Contacts

Contacts should only be visible for these client types:

- Limited company
- LLP
- Charity
- Partnership

At signup, the client starts with one signing contact.

After signup, additional contacts can be added.

Allowed contact types:

- Director
- Partner / Member where applicable
- Trustee where applicable
- Bookkeeper
- Other

Remove or deprecate unnecessary types if currently exposed:

- Finance Director
- Secretary
- Personal

### Contact Permissions

Director / Partner / Trustee:

- Can be primary contact.
- Can be document signer if toggled on.

Bookkeeper:

- No signing option by default.
- Limited visibility.
- Intended mainly for bookkeeping/document support.

Other:

- No signing option by default unless explicitly required.
- Limited visibility.

Acceptance criteria:

- Contact types reflect real accountancy practice use.
- Primary contact logic is clear.
- Document signer logic is explicit.
- Contact access does not leak sensitive data unnecessarily.

---

## Phase 11 — Questionnaires

### 11.1 Questionnaire Tab

Each client should have a Questionnaire tab showing:

- Available questionnaires.
- Sent questionnaires.
- Completed questionnaires.
- Linked job.
- Completion date.
- Status.

### 11.2 Template Dependency

Questionnaires available to add must come from Templates.

If no questionnaire templates exist, show:

> Please head to the Templates section to create your first questionnaire.

Do not allow creation of unstructured ad hoc questionnaires unless existing architecture already supports it safely.

### 11.3 Linked Job

Replace “Period label” with “Linked Job”.

Every questionnaire should either:

- Link to an existing job; or
- Create a job where the questionnaire itself initiates that work.

This solves the real-world overlap issue where a client signs up in one tax year but only wants assistance for a different filing period.

Example:

A client signs up in December 2025 but only wants help with the 2025/26 tax return, not the 2024/25 return due by 31 January 2026. The questionnaire must link to the correct job/period.

### 11.4 Sending Behaviour

When a questionnaire is sent:

- Questionnaire instance is created.
- It is linked to client and job.
- Template email is queued using practice-level automation settings.
- Accountant can review/cancel queued email if existing queue functionality supports this.

### 11.5 Completion Behaviour

When completed:

- Questionnaire status becomes completed.
- Completion timestamp is recorded.
- Job updates to Records received.
- Records chasers cease.
- Staff/partner notification is generated.

Acceptance criteria:

- Questionnaires are not disconnected forms.
- Questionnaires move jobs forward.
- Period/job ambiguity is solved.

---

## Phase 12 — Workpapers

### 12.1 Workpapers Tab

Each client should have a Workpapers tab showing:

- Current workpapers.
- Historic workpapers.
- Linked job.
- Linked service.
- Status: Active / Completed / Locked / Unlocked for amendment.
- Created date.
- Completed date.

### 12.2 Template Dependency

If no workpaper templates exist and the user tries to create a workpaper, show:

> Please complete your first workpaper in the Workpapers tab.

If the existing product has a global Workpapers/Templates area, route users there with the correct link.

### 12.3 Workpaper Creation Rules

Workpapers should be created as follows:

#### Self-Assessment Non-MTD

- Created on client questionnaire submission.

#### Self-Assessment MTD

Quarterly filings:

- Pulled from AccountancyOS bookkeeping if used.
- Otherwise manually creatable.

Annual filings:

- Pulled from bookkeeping where available.
- Plus client questionnaire submission.

#### Limited Company

- Pulled from AccountancyOS bookkeeping where used.
- Otherwise manually creatable / TB import where supported.
- Plus questionnaire completion for non-ledger tax/accounting confirmations.

Questionnaire should cover items such as:

- Associated companies.
- Bank account for refund.
- Mileage.
- Home office claim.
- Capital purchases.
- Property purchases.
- Other annual confirmations.

#### VAT

- Pulled from bookkeeping where used.
- Otherwise manually creatable.

#### Partnership / LLP

- Pulled from bookkeeping where used.
- Otherwise manually creatable.
- Plus questionnaire completion.

### 12.4 Locking

Completed workpapers are locked.

Workpapers should lock when the related filing is submitted/accepted, depending on existing filing lifecycle.

Unlocking should be possible only for amendments and must require:

- Reason.
- User.
- Timestamp.
- Audit log.

Acceptance criteria:

- Workpapers are the bridge between records/bookkeeping and filings.
- Completed workpapers cannot be silently changed.
- Filing state controls locking.

---

## Phase 13 — Deadlines

Deadlines must be linked to services and jobs, and should feed both the client record and overview dashboard.

### 13.1 Self-Assessment Non-MTD

Deadlines:

- 31 January filing deadline.
- 31 January payment deadline.
- 31 July payment on account deadline where applicable.

Accountant should be able to enter:

- 31 January payment required.
- 31 July payment required.
- 31 January refund due.

Payment required should trigger payment reminders according to automation settings.

Refund due should be visible to client but should not trigger payment reminder emails.

### 13.2 Self-Assessment MTD

Deadlines:

- Quarterly updates due 1 month and 7 days after quarter end:
  - 7 August
  - 7 November
  - 7 February
  - 7 May
- End of period statement / final declaration due 31 January following tax year end where applicable.
- Payment deadlines:
  - 31 January
  - 31 July for payments on account where applicable.

### 13.3 Limited Company

Deadlines:

- Accounts deadline from Companies House where available.
- CT600 deadline from HMRC where available; otherwise 12 months after period end.
- Corporation tax payment due 9 months and 1 day after accounting period end.
- Confirmation statement from Companies House.

Important: do not incorrectly set corporation tax due date as 1 day after Companies House accounts due date. UK corporation tax is normally due 9 months and 1 day after the accounting period end for non-large companies.

### 13.4 LLP

Deadlines:

- Accounts deadline from Companies House.
- Partnership tax return due 31 January following tax year.
- Payment deadline 31 January where applicable.

### 13.5 Partnership

Deadlines:

- Partnership tax return due 31 January following tax year.
- Payment deadline 31 January where applicable.

### 13.6 VAT

Deadlines:

- VAT filing due 1 month and 7 days after VAT quarter end.
- VAT payment due same date where standard electronic payment applies.

### 13.7 PAYE

Deadlines:

- FPS on or before payday.
- PAYE/NIC electronic payment due 22nd of following month.
- EPS due 19th of following month where applicable.
- Pension payment due based on provider/rules; default can align to 22nd only if explicitly configured.
- P60 due 31 May following tax year end.

### 13.8 Charity

Deadlines:

- Charity Commission annual return: normally 10 months after financial year end.
- Charity Commission accounts: normally 10 months after financial year end.
- Companies House annual accounts where applicable: normally 9 months after year end.
- CT600 if required: 12 months after period end.
- Gift Aid claim window: 4 years.

### 13.9 Capital Gains Tax Return

Accountant enters completion date from completion statement.

System calculates:

- Filing deadline: 60 days from completion.
- Payment deadline: same date.
- Payment amount can be entered for automation.

Acceptance criteria:

- Deadlines are generated from service/job/client facts.
- Deadlines appear on client and overview pages.
- Payment reminders distinguish tax payable from refund due.
- Deadline rules are not hardcoded only in UI.

---

## Phase 14 — Billing / Revenue Visibility

### 14.1 Services → Billing

Fees from accepted quotes and client service records should flow into billing/revenue reporting.

Track:

- One-off fees.
- Monthly recurring fees.
- Service-level fee.
- Client total monthly fees.
- Client total one-off fees.
- Total firm recurring revenue.
- Total firm one-off revenue.
- Lead revenue from unaccepted quotes.

### 14.2 Billing Tab

Audit whether a separate Billing tab is needed.

If kept, it should show:

- Quote history.
- Accepted quotes.
- Rejected quotes.
- Quote accepted date.
- Service fees.
- Invoice/payment history only if AccountancyOS genuinely has or integrates with practice billing.

Do not duplicate the accountant practice’s own bookkeeping system unless this product is intentionally managing billing.

### 14.3 Reporting

Revenue should be filterable by:

- Calendar year.
- Client.
- Service.
- Staff/partner.
- Lead source where available.

Future goal:

- Attribute revenue earned per lead source/campaign to support ROI calculations.

Acceptance criteria:

- Overview revenue metrics are real.
- Services and quotes feed billing visibility.
- No fake invoice/payment history is shown.

---

## Phase 15 — Automation Settings

Settings should allow practice-level automation adjustment.

Required settings:

- Records request chasing cadence.
- Quote chasing cadence.
- Deadline reminder cadence.
- Payment reminder cadence.
- SLA response times for conversations/emails.
- Toggle automated chasers on/off.

Important audit point:

- Remove duplicate cadence wording such as both “7 days” and “1 week”. Normalise cadence labels.
- Do not use irrelevant stop conditions such as “records received” for every automation.

Correct stop conditions should depend on automation type.

Examples:

- Records request chaser stops when job status is Records received or later.
- Deadline reminder stops when the underlying job/deadline is completed, filed, paid, or no longer relevant.
- Payment reminder stops when payment is marked paid or no payment is due.
- Quote chaser stops when quote is accepted, rejected, expired, or manually cancelled.
- Onboarding chaser stops when onboarding requirement is complete.

Acceptance criteria:

- Automation rules have correct trigger and stop conditions.
- Labels are clean and non-duplicative.
- Practice-level settings are persisted.
- Queued emails are visible and cancellable where applicable.

---

## Phase 16 — Filing Engine Interaction

Audit current filing-engine integration points.

The intended filing flow is:

- Numeric data flows from ledger / TB import / manual adjustments into approved workpapers.
- Workpapers feed approved filing models.
- Filings are generated from approved models.
- Clients do not submit filings directly.
- Accountant submits filings.
- Filing accepted state updates job and locks workpaper.

### VAT and PAYE

Investigate how AccountancyOS bookkeeping interacts with:

- VAT filings.
- PAYE/RTI filings.

### Auto-Drafted Journals

Where filing/workpaper logic identifies required accounting journals, the system may auto-draft journals for accountant approval.

Do not auto-post journals without approval.

Required journal behaviour:

- Draft journal created.
- Linked to job/workpaper.
- Accountant reviews.
- Accountant approves/posts.
- Audit log records approval.

Acceptance criteria:

- Filing state and workpaper state are connected.
- Accepted filing can complete jobs.
- Workpapers lock after filing acceptance.
- Journals are never silently posted by automation.

---

## Implementation Order

Follow this order unless the reconnaissance proves a different dependency order is safer:

1. Security/session/GDPR audit and urgent fixes.
2. Core type alignment: lead type / client type / service catalogue.
3. Job/service/deadline relationship audit and repair.
4. Questionnaire-to-job completion flow.
5. Workpaper creation/locking flow.
6. Engagement-letter trigger on service/fee changes.
7. Overview dashboard backed by real jobs/deadlines/SLAs/revenue.
8. CRM quote flow and stage history.
9. Client detail tabs by type.
10. Documents/signature audit trail.
11. Contacts and permissions.
12. Conversations/SLA grouping.
13. Billing/revenue visibility.
14. Automation settings cleanup.
15. Filing engine integration points.

---

## Required Output From Claude Before Coding

Produce a response with:

1. Repository reconnaissance summary.
2. Existing tables/functions/components relevant to this brief.
3. Gaps and risks.
4. Proposed implementation plan in ordered phases.
5. Files likely to be changed.
6. Migrations likely to be needed.
7. RLS/security implications.
8. Questions that genuinely block implementation.

Only then proceed with code changes.

---

## Required Output After Coding

After implementation, provide:

1. Summary of changes made.
2. Files changed.
3. Migrations added.
4. New/updated RPCs or edge functions.
5. RLS/security changes.
6. Manual QA checklist.
7. Automated tests run.
8. Known limitations or blocked production items.
9. Regression risks.

---

## QA Checklist

At minimum, verify:

### Security

- Organisation A cannot see Organisation B data.
- Portal user cannot access another client.
- Staff cannot see unauthorised firm-wide data if role restrictions exist.
- Storage documents are not cross-visible.
- Edge functions validate organisation/client access server-side.

### CRM / Quote

- Lead type dropdown uses approved list.
- Companies House lookup persists data where available.
- Quote sent from CRM is visible in lead history.
- Stage movement creates history.
- Quote acceptance does not create unsafe active client before engagement letter state is satisfied.

### Client / Services

- Client details are type-specific.
- Services from accepted quote populate client services.
- Fee/service changes trigger engagement letter refresh.
- Last engagement letter signed date appears.

### Jobs

- Services create correct jobs.
- Questionnaire completion updates job to Records received.
- Records verified creates/opens workpaper.
- Filing accepted completes job.
- Recurring jobs roll over.

### Deadlines

- Deadlines generated for SA, MTD, Ltd, LLP, Partnership, VAT, PAYE, Charity, and CGT where relevant.
- Deadlines appear on client tab and overview.
- Payment reminders only run where payment is due.
- Refunds are visible but do not trigger payment chasers.

### Documents

- Accountant upload supports visibility/signature toggles.
- Client upload works.
- Signature requires scroll-through.
- Signed version is preserved.
- Audit log records upload/signature/visibility/archive/delete events.

### Conversations

- Email/in-app/internal messages visible.
- Messages can be linked to job.
- Active/Archived filter persists.
- SLA overdue items appear on overview.

### Workpapers / Filing

- Workpaper created from correct trigger.
- Completed/filing-linked workpaper locks.
- Unlock requires reason and audit log.
- Filing accepted updates job.

---

## Final Product Standard

Do not optimise for a demo. Optimise for a small UK accountancy practice genuinely being able to run client work inside AccountancyOS without bypasses, fake status changes, disconnected questionnaires, manual deadline spreadsheets, or legal exposure from unsigned engagement changes.

Every implementation choice should strengthen the core AccountancyOS thesis:

**One connected operating system for accountants, where client inputs and bookkeeping data flow into jobs, workpapers, filings, deadlines, communications, billing visibility, and next-period rollover.**

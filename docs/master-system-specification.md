# AccountancyOS Master System Specification (As-Built)

**Version:** 1.0  
**Generated:** February 2026  
**Classification:** Internal Product Documentation

---

## Table of Contents

1. [Application Surface Area](#1-application-surface-area)
2. [Page-Level Specification](#2-page-level-specification)
3. [Database Entity Map](#3-database-entity-map)
4. [Data Lineage](#4-data-lineage)
5. [Integrations](#5-integrations)
6. [Workflows & State Machines](#6-workflows--state-machines)
7. [Permissions & Access Control](#7-permissions--access-control)
8. [Edge Functions Inventory](#8-edge-functions-inventory)
9. [Technical Architecture](#9-technical-architecture)
10. [Known Gaps & TODOs](#10-known-gaps--todos)

---

## 1. Application Surface Area

### 1.1 Route Inventory

AccountancyOS contains **43 routes** organized across functional domains.

#### Core Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/` | Index | Yes | Dashboard redirect based on setup state |
| `/auth` | Auth | No | Login/signup/password recovery |
| `/confirm-email` | ConfirmEmail | No | Email verification landing |
| `/welcome` | WelcomeDashboard | Yes | New user onboarding dashboard |
| `/overview` | Overview | Yes | Practice overview with KPIs |

#### Client Management Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/crm` | CRM | Yes | Lead & prospect management |
| `/clients` | Clients | Yes | Client list with filtering |
| `/clients/:clientId` | ClientPortal | Yes | Individual client detail view |
| `/companies/:companyId` | CompanyDetail | Yes | Company detail (CoSec, registers) |

#### Sales & Onboarding Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/services` | Services | Yes | Service catalog management |
| `/quotes` | Quotes | Yes | Quote list and management |
| `/quotes/:id` | QuoteDetail | Yes | Individual quote detail |
| `/onboarding` | Onboarding | Yes | Client onboarding pipeline |
| `/onboarding/:id` | OnboardingDetail | Yes | Individual onboarding workflow |
| `/onboarding-wizard` | OnboardingWizard | Yes | Practice setup wizard |

#### Work Management Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/jobs` | Jobs | Yes | Job list & pipeline view |
| `/jobs/:jobId` | JobDetail | Yes | Individual job workspace |
| `/deadlines` | Deadlines | Yes | Deadline calendar & list |
| `/workpapers` | Workpapers | Yes | Workpaper list |

#### Filing Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/filings` | Filings | Yes | Filing queue & status |
| `/filings/:filingId` | FilingDetail | Yes | Individual filing detail |

#### Bookkeeping Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/bookkeeping` | Bookkeeping | Yes | Full bookkeeping module |

#### Payroll Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/payroll` | Payroll | Yes | Payroll module hub |
| `/payroll/pay-runs/:payRunId` | PayRunDetail | Yes | Individual pay run |
| `/payroll/employees/:employeeId` | EmployeeDetail | Yes | Employee detail |

#### CIS Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/cis` | CIS | Yes | CIS module hub |
| `/cis/returns/:cisReturnId` | CISReturnDetail | Yes | CIS return detail |

#### Template & Automation Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/templates` | Templates | Yes | Template management |
| `/templates/:id` | TemplateDetail | Yes | Template editor |
| `/automations` | Automations | Yes | Automation rules |
| `/settings/job-templates` | JobTemplates | Yes | Job template editor |

#### Communication Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/emails` | Emails | Yes | Email inbox/sent |
| `/auth/gmail/callback` | GmailCallback | Yes | Gmail OAuth callback |
| `/auth/outlook/callback` | OutlookCallback | Yes | Outlook OAuth callback |

#### Settings Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/settings` | Settings | Yes | Practice settings hub |
| `/settings/branding` | BrandingSettings | Yes | Branding configuration |
| `/settings/hmrc` | HMRCSettings | Yes | HMRC integration settings |
| `/settings/companies-house` | CompaniesHouseSettings | Yes | CH integration settings |
| `/settings/permissions` | PermissionsSettings | Yes | Role permissions |

#### Billing Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/subscription` | Subscription | Yes | Billing & subscription |
| `/complete-payment` | CompletePayment | Yes | Payment completion |

#### Public Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/questionnaire/:instanceId` | QuestionnaireResponse | No | Public questionnaire response |
| `/color-comparison` | ColorComparison | No | Color system comparison (dev) |

#### Preview Routes

| Route | Page Component | Auth Required | Purpose |
|-------|----------------|---------------|---------|
| `/portal/preview/:entityType/:entityId` | PortalPreview | Yes | Client portal preview |
| `/ops/health` | OpsHealth | Yes | Operations health check |

---

## 2. Page-Level Specification

### 2.1 Dashboard & Overview

#### Overview Page (`/overview`)

**Purpose:** Practice-wide dashboard showing key performance indicators, pending actions, and pipeline status.

**Access:** All authenticated users (viewer has read-only)

**Entry Points:**
- Sidebar navigation
- Logo click from any page

**Exit Points:**
- Click on deadline → Deadlines page
- Click on job → Job detail
- Click on client → Client portal

**Key Components:**
- `DashboardKPICards` - Revenue, job counts, deadline metrics
- `DeadlineWidget` - Upcoming deadlines
- `JobPipelineChart` - Job status distribution
- `OverdueActionsPanel` - SLA breaches
- `AutomationActivityFeed` - Recent automation runs
- `StaffVarianceTable` - Time tracking variances

**State Management:**
- React Query for data fetching
- Date range filter in component state

---

#### Jobs Page (`/jobs`)

**Purpose:** Central hub for managing all client work items.

**Access:** 
- Owner, Admin, Manager, Staff: Full access
- Viewer: Read-only

**Entry Points:**
- Sidebar navigation
- Dashboard job widgets
- Client portal → Jobs tab

**Exit Points:**
- Click job → Job detail
- Create job → Create dialog → Job detail
- Click client name → Client portal

**Key Components:**
- `JobsQuickFilters` - Status/type/assignee filters
- `SavedViewsDropdown` - Saved filter presets
- `CreateJobDialog` - Job creation modal
- Jobs table with sorting/pagination

**State Management:**
- URL parameters for filters
- `useJobFilters` hook for filter state
- Saved views stored in database

---

### 2.2 Client Management

#### Clients Page (`/clients`)

**Purpose:** List and manage all clients (individuals and companies).

**Access:** All authenticated users

**Key Components:**
- `ClientTypeFilters` - Filter by client type
- `AddClientDialog` - Create new client
- Client table with search

**Client Types Supported:**
- `self_assessment` - Self Assessment individuals
- `limited_company` - Limited companies
- `llp` - Limited Liability Partnerships
- `partnership` - Traditional partnerships
- `sole_trader` - Sole traders
- `landlord` - Property landlords
- `charity` - Charitable organizations
- `trust` - Trusts

---

#### Client Portal (`/clients/:clientId`)

**Purpose:** Unified view of individual client with all related data.

**Tabs:**
- Overview - Key info, recent activity
- Jobs - Client's jobs
- Deadlines - Client's deadlines
- Documents - Uploaded files
- Messages - Portal messages
- Questionnaires - Sent questionnaires
- Banking - Connected bank accounts
- Services - Engaged services
- Workpapers - Client workpapers

---

#### Company Detail (`/companies/:companyId`)

**Purpose:** Company-specific view with company secretary features.

**Tabs:**
- Overview - Company info
- Registers - Statutory registers
- Officers - Directors and secretary
- Shareholders - Share ownership
- PSCs - Persons with significant control
- Jobs - Company jobs
- Payroll - Company payroll (if applicable)

**Key Components:**
- `RegistersTab` - Company registers browser
- `OfficersSection` - Officer management
- `ShareholdersSection` - Shareholder register
- `PSCsSection` - PSC register
- `RegisterEventsTimeline` - Chronological register events

---

### 2.3 Bookkeeping Module

#### Bookkeeping Page (`/bookkeeping`)

**Purpose:** Full double-entry bookkeeping system.

**Sub-Modules (Tabs):**
1. **Business Overview** - P&L summary, cash position
2. **Banking** - Bank accounts and transactions
3. **Sales** - Sales invoices and credit notes
4. **Bills** - Purchase bills and payments
5. **Customers** - Customer master data
6. **Suppliers** - Supplier master data
7. **Journals** - Manual journal entries
8. **Chart of Accounts** - Account structure
9. **General Ledger** - Full ledger view
10. **Trial Balance** - TB report
11. **Reports** - P&L, Balance Sheet, Aged reports
12. **VAT Returns** - VAT period management
13. **Bank Rules** - Auto-categorization rules
14. **Period Lock** - Accounting period controls

**Key Components per Tab:**

*Banking Tab:*
- `BankingTab` - Main container
- `AddBankAccountDialog` - Manual bank account
- `ConnectBankDialog` - TrueLayer connection
- `ImportBankTransactionsDialog` - CSV import
- `CategorizeBankTransactionDialog` - Transaction coding

*Sales Tab:*
- `InvoicesTab` - Invoice list
- `InvoiceEditorDialog` - Create/edit invoice
- `RecordPaymentDialog` - Payment recording
- `CreditNotesTab` - Credit note management

*Bills Tab:*
- `BillsTab` - Bill list
- `BillEditorDialog` - Create/edit bill
- `RecordBillPaymentDialog` - Payment recording

*VAT Tab:*
- `VATReturnsTab` - VAT return list
- `VATPeriodsTab` - Period management
- `VATReconciliationPanel` - Box reconciliation
- `VATAdjustmentsPanel` - Manual adjustments

---

### 2.4 Payroll Module

#### Payroll Page (`/payroll`)

**Purpose:** Full payroll processing with RTI submissions.

**Sub-Modules (Tabs):**
1. **Overview** - Payroll summary
2. **PAYE Schemes** - Employer scheme management
3. **Employees** - Employee records
4. **Pay Runs** - Payroll processing
5. **Payslips** - Payslip history
6. **RTI Submissions** - HMRC submission status

**Key Components:**
- `PayeSchemeSelector` - Multi-scheme support
- `AddPayeSchemeDialog` - Create PAYE scheme
- `AddEmployeeDialog` - Add employee
- `CreatePayRunDialog` - Start pay run
- `PayslipViewDialog` - View payslip
- `SubmitRTIDialog` - RTI submission

---

### 2.5 CIS Module

#### CIS Page (`/cis`)

**Purpose:** Construction Industry Scheme management.

**Sub-Modules (Tabs):**
1. **Contractors** - CIS contractor entities
2. **Subcontractors** - Subcontractor verification
3. **Payments** - CIS payment records
4. **Returns** - Monthly return submissions

**Key Components:**
- `CISContractorsTab` - Contractor management
- `CISSubcontractorsTab` - Subcontractor verification
- `CISPaymentsTab` - Payment recording
- `CISReturnsTab` - Return preparation
- `SubmitCISReturnDialog` - HMRC submission

---

### 2.6 Filing Module

#### Filings Page (`/filings`)

**Purpose:** Central filing queue for all regulatory submissions.

**Filing Types:**
- `VAT_RETURN` - VAT100 returns
- `CT600` - Corporation Tax returns
- `ANNUAL_ACCOUNTS` - Companies House accounts
- `CONFIRMATION_STATEMENT` - CS01
- `SELF_ASSESSMENT` - SA100 returns
- `RTI_FPS` - Full Payment Submission
- `RTI_EPS` - Employer Payment Summary
- `CIS_MONTHLY` - CIS300 monthly return

**Key Components:**
- Filing list with status filters
- `FilingPipelineStatus` - Pipeline visualization
- `FilingDetail` - Individual filing view

#### Filing Detail (`/filings/:filingId`)

**Purpose:** Individual filing workspace with approval workflow.

**Key Components:**
- `JobFilingTab` - Filing data
- `FilingPipelineStatus` - Status indicator
- Approval workflow UI
- Submission controls

---

### 2.7 Templates

#### Templates Page (`/templates`)

**Purpose:** Manage reusable templates for emails, questionnaires, workpapers, and jobs.

**Template Types:**
- `email` - Email templates with placeholders
- `questionnaire` - Client questionnaire forms
- `workpaper` - Workpaper templates
- `job` - Job templates with task lists

**Key Components:**
- `EmailTemplateEditor` - Email template builder
- `QuestionnaireTemplateEditor` - Form builder
- `WorkpaperTemplateEditor` - Workpaper structure
- `JobTemplateEditorFullscreen` - Job template with tasks

---

## 3. Database Entity Map

### 3.1 Core Entities (7 tables)

| Table | Purpose | Primary Key | Key Relationships |
|-------|---------|-------------|-------------------|
| `organizations` | Multi-tenant root entity | `id` (UUID) | Parent of all tenant data |
| `organization_users` | User membership & roles | `id` (UUID) | FK → organizations, auth.users |
| `clients` | Individual clients (SA, landlords) | `id` (UUID) | FK → organizations |
| `companies` | Corporate entities (Ltd, LLP) | `id` (UUID) | FK → organizations |
| `leads` | CRM prospects | `id` (UUID) | FK → organizations |
| `contacts` | Contact persons | `id` (UUID) | FK → organizations, clients/companies |
| `client_contacts` | Client-contact junction | `id` (UUID) | FK → clients, contacts |

### 3.2 Client Detail Extensions (5 tables)

| Table | Purpose | Relationship |
|-------|---------|--------------|
| `client_detail_sa` | Self Assessment specifics | 1:1 with clients |
| `client_detail_cgt` | Capital Gains Tax details | 1:1 with clients |
| `client_detail_charity` | Charity-specific fields | 1:1 with clients |
| `client_detail_partnership` | Partnership details | 1:1 with clients |
| `company_vat_schemes` | Company VAT registration | 1:N with companies |

### 3.3 Company Secretary (8 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `company_persons` | Master person records | name, address, DOB, nationality |
| `company_officers` | Directors/secretaries | person_id, role, appointed_on, resigned_on |
| `company_pscs` | Persons with significant control | nature_of_control, notified_on |
| `share_classes` | Share class definitions | class_name, nominal_value, voting_rights |
| `share_allotments` | Share allotment events | shares_allotted, consideration, allotment_date |
| `share_transfers` | Share transfer events | from_person_id, to_person_id, shares_transferred |
| `company_register_events` | Statutory register timeline | event_type, event_date, details |
| `company_ch_sync_state` | CH sync status | last_synced_at, sync_hash |

### 3.4 Jobs & Workflow (8 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `jobs` | Work items | job_type, status, client_id/company_id, assignee_id |
| `job_tasks` | Tasks within jobs | job_id, task_name, status, due_date |
| `job_documents` | Uploaded files | job_id, file_path, document_type |
| `job_conversations` | Internal/client messages | job_id, message, sender_type |
| `job_time_entries` | Time tracking | job_id, user_id, duration, billable |
| `job_saved_views` | Saved filter presets | name, filters, user_id |
| `deadlines` | Filing/compliance deadlines | deadline_type, due_date, status |
| `engagement_deadlines` | Engagement-based deadlines | engagement_id, deadline configuration |

### 3.5 Bookkeeping (25+ tables)

#### Chart of Accounts
| Table | Purpose |
|-------|---------|
| `bookkeeping_accounts` | Chart of accounts |
| `vat_codes` | VAT code master |

#### Ledger
| Table | Purpose |
|-------|---------|
| `journals` | Journal headers |
| `journal_lines` | Journal line items |
| `ledger_entries` | General ledger entries |

#### Sales
| Table | Purpose |
|-------|---------|
| `customers` | Customer master |
| `invoices` | Sales invoice headers |
| `invoice_lines` | Invoice line items |
| `invoice_payments` | Payment allocations |
| `credit_notes` | Credit note headers |
| `credit_note_lines` | Credit note lines |
| `credit_note_allocations` | Credit applications |

#### Purchases
| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier master |
| `bills` | Purchase bill headers |
| `bill_lines` | Bill line items |
| `bill_payments` | Payment allocations |

#### Banking
| Table | Purpose |
|-------|---------|
| `bank_accounts` | Bank account records |
| `bank_transactions` | Bank feed transactions |
| `bank_connections` | TrueLayer connections |
| `bank_rules` | Auto-categorization rules |
| `bank_rule_executions` | Rule execution log |
| `matching_candidates` | Payment matching suggestions |

#### VAT
| Table | Purpose |
|-------|---------|
| `vat_periods` | VAT accounting periods |
| `vat_returns` | VAT return records |
| `vat_reconciliations` | Box reconciliation data |
| `vat_obligations` | HMRC VAT obligations |

#### Control
| Table | Purpose |
|-------|---------|
| `period_locks` | Accounting period locks |
| `trial_balance_snapshots` | TB snapshots |

### 3.6 Filing & Tax (12+ tables)

| Table | Purpose |
|-------|---------|
| `filings` | All HMRC/CH filings |
| `filing_submissions` | Submission attempts |
| `filing_approvals` | Client approvals with signatures |
| `filing_model_snapshots` | Immutable filing data snapshots |
| `filing_payload_artifacts` | XML/JSON submission payloads |
| `ct_computation_snapshots` | CT600 tax computations |
| `accounts_model_snapshots` | FRS105 accounts model |
| `capital_allowance_periods` | Capital allowance periods |
| `capital_allowance_pools` | WDA pool balances |
| `hmrc_authorisations` | Client HMRC agent authorisations |
| `hmrc_auth_states` | OAuth state tokens |
| `approval_revocation_log` | Approval revocation audit |

### 3.7 Payroll (10+ tables)

| Table | Purpose |
|-------|---------|
| `paye_schemes` | Employer PAYE schemes |
| `employees` | Employee records |
| `employee_absences` | Absence records |
| `employee_benefits` | Benefit records |
| `employee_student_loans` | Student loan plans |
| `pay_runs` | Payroll run headers |
| `pay_run_lines` | Pay run line items |
| `payslips` | Generated payslips |
| `rti_submissions` | RTI filing records |
| `pension_schemes` | Pension scheme config |
| `pension_contributions` | Pension contribution records |

### 3.8 CIS (4 tables)

| Table | Purpose |
|-------|---------|
| `cis_contractors` | CIS contractor entities |
| `cis_subcontractors` | Subcontractor records |
| `cis_payments` | CIS payment records |
| `cis_returns` | Monthly CIS returns |

### 3.9 Templates & Automation (8 tables)

| Table | Purpose |
|-------|---------|
| `templates` | Master template store |
| `workpaper_templates` | Workpaper template definitions |
| `workpaper_instances` | Instantiated workpapers |
| `questionnaire_instances` | Sent questionnaires |
| `questionnaire_responses` | Response data |
| `automation_rules` | Automation rule definitions |
| `automation_events` | Trigger event queue |
| `automation_executions` | Execution log |
| `automation_rule_templates` | Reusable automation templates |
| `automation_rate_limits` | Rate limiting state |

### 3.10 Email & Communication (8 tables)

| Table | Purpose |
|-------|---------|
| `connected_mailboxes` | Gmail/Outlook connections |
| `email_messages` | Synced email messages |
| `email_threads` | Email thread grouping |
| `email_attachments` | Email attachment metadata |
| `email_queue` | Outbound email queue |
| `email_push_subscriptions` | Push notification subscriptions |
| `client_messages` | Portal messages |
| `client_tasks` | Portal tasks |
| `message_entity_links` | Entity tagging |
| `message_templates` | Quick reply templates |

### 3.11 Portal & Onboarding (6 tables)

| Table | Purpose |
|-------|---------|
| `portal_access` | Client portal permissions |
| `portal_visibility_settings` | Visibility configuration |
| `onboarding_applications` | Client onboarding records |
| `onboarding_documents` | Onboarding document uploads |
| `engagement_letters` | Engagement letter records |
| `engagements` | Service engagements |

### 3.12 System & Audit (6 tables)

| Table | Purpose |
|-------|---------|
| `audit_log` | Full audit trail |
| `notifications` | User notifications |
| `org_settings` | Organization settings |
| `org_branding` | Branding configuration |
| `api_rate_limits` | API rate limiting |
| `fx_rates` | Foreign exchange rates |

---

## 4. Data Lineage

### 4.1 Companies Table - Field Sources

| Field | Source | Sync Method | Writeable |
|-------|--------|-------------|-----------|
| `company_name` | User input OR Companies House API | CH sync edge function | Yes |
| `company_number` | User input OR CH lookup | CH sync | Yes (before sync) |
| `registered_office_address` | Companies House API | CH sync | No (overwritten) |
| `sic_codes` | Companies House API | CH sync | No |
| `incorporation_date` | Companies House API | CH sync | No |
| `company_status` | Companies House API | CH sync | No |
| `trading_status` | User input | Manual | Yes |
| `trading_name` | User input | Manual | Yes |
| `utr` | User input | Manual | Yes |
| `vat_number` | User input | Manual | Yes |
| `auth_code` | User input | Manual (sensitive) | Yes |
| `year_end_day` | User input | Manual | Yes |
| `year_end_month` | User input | Manual | Yes |
| `partner_in_charge` | User selection | FK → organization_users | Yes |
| `staff_in_charge` | User selection | FK → organization_users | Yes |
| `aml_verified_at` | System timestamp | On AML verification | No |
| `aml_verified_by` | System | User who verified | No |

### 4.2 Clients Table - Field Sources

| Field | Source | Notes |
|-------|--------|-------|
| `first_name`, `last_name` | User input | Required |
| `email` | User input | Required, unique per org |
| `client_type` | User selection | Enum value |
| `date_of_birth` | User input | Optional |
| `national_insurance_number` | User input | Validated format |
| `utr` | User input | 10-digit format |
| `address_*` | User input | Address fields |
| `aml_verified_at/by` | System | On verification |
| `status` | System/User | active, inactive, disengaged |

### 4.3 Invoices - Field Sources

| Field | Source | Computed |
|-------|--------|----------|
| `invoice_number` | Auto-generated | From org_settings sequence |
| `customer_id` | User selection | FK → customers |
| `issue_date` | User input | Defaults to today |
| `due_date` | Computed | issue_date + payment_terms |
| `total_net` | Computed | Sum of line net amounts |
| `total_vat` | Computed | Sum of line VAT amounts |
| `total_gross` | Computed | Net + VAT |
| `amount_paid` | Computed | Sum of payments |
| `remaining_balance` | Computed | Gross - Paid |
| `status` | State machine | DRAFT→ISSUED→PAID |

### 4.4 Bank Transactions - Field Sources

| Field | Source | Notes |
|-------|--------|-------|
| `transaction_date` | Bank feed OR CSV import | From source |
| `amount` | Bank feed OR CSV | Positive/negative |
| `description` | Bank feed OR CSV | Raw description |
| `category` | Bank rule OR manual | Auto or user-assigned |
| `status` | System | unmatched, matched, reconciled |
| `matched_ledger_entry_id` | Matching process | FK when matched |
| `rule_id` | Auto-categorization | FK to bank_rules |
| `truelayer_transaction_id` | TrueLayer sync | Provider reference |

### 4.5 Filings - Field Sources

| Field | Source | Notes |
|-------|--------|-------|
| `filing_type` | Job creation | Based on job type |
| `filing_body` | System | HMRC or CH |
| `status` | State machine | Workflow status |
| `filing_data` | Workpaper/computation | JSON payload |
| `model_snapshot_id` | Snapshot service | Immutable reference |
| `api_submission_id` | HMRC/CH API | On submission |
| `hmrc_correlation_id` | HMRC API | Tracking ID |
| `filed_at` | System | On successful filing |
| `approved_at/by` | Approval workflow | Client approval |

---

## 5. Integrations

### 5.1 HMRC Integration

**Purpose:** VAT returns, Corporation Tax, RTI payroll, CIS returns

**OAuth Flow:**
1. User initiates from Settings → HMRC
2. `hmrc-auth` edge function generates OAuth URL
3. Redirect to HMRC login
4. `hmrc-callback` receives authorization code
5. Exchanges for access/refresh tokens
6. Stores in `organization_integrations_hmrc` table

**Token Storage:** `organization_integrations_hmrc` table
- `access_token` - Short-lived access token
- `refresh_token` - Long-lived refresh token
- `expires_at` - Token expiration
- `scopes` - Authorized scopes (read:vat, write:vat, etc.)

**Edge Functions:**
| Function | Purpose | JWT Required |
|----------|---------|--------------|
| `hmrc-auth` | Initiate OAuth flow | Yes |
| `hmrc-callback` | Handle OAuth callback | No (state param) |
| `hmrc-vat-submit` | Submit VAT return | Yes |
| `hmrc-vat-obligations` | Fetch VAT obligations | Yes |
| `hmrc-ct-submit` | Submit CT600 | Yes |
| `hmrc-ct-poll` | Poll CT600 status | Yes |
| `hmrc-ct-delete` | Delete pending CT600 | Yes |

**Error Handling:**
- Token refresh on 401
- Retry with backoff on 5xx
- User notification on permanent failure

---

### 5.2 Companies House Integration

**Purpose:** Company data sync, confirmation statements, officer changes

**Authentication:** API key (no OAuth)

**Credential Storage:** `organization_integrations_companies_house` table
- `api_key` - Companies House API key
- `presenter_id` - Filing presenter ID
- `presenter_auth_code` - Filing authentication

**Edge Functions:**
| Function | Purpose |
|----------|---------|
| `companies-house-sync` | Sync company data from CH |
| `ch-submit` | Submit filings to CH |

**Data Sync Fields:**
- Company name and status
- Registered office address
- SIC codes
- Officers (current and resigned)
- PSCs
- Filing history

---

### 5.3 Email Providers

#### Gmail Integration

**OAuth Flow:**
1. `gmail-auth` generates OAuth URL with scopes
2. User authorizes in Google
3. `gmail-callback` exchanges code for tokens
4. `gmail-exchange` handles token exchange
5. Tokens stored in `connected_mailboxes`

**Edge Functions:**
| Function | Purpose |
|----------|---------|
| `gmail-auth` | Initiate OAuth |
| `gmail-callback` | OAuth callback |
| `gmail-exchange` | Token exchange |
| `gmail-sync` | Sync inbox/sent |
| `gmail-send` | Send email |

#### Outlook Integration

**OAuth Flow:** Same pattern as Gmail with Microsoft identity

**Edge Functions:**
| Function | Purpose |
|----------|---------|
| `outlook-auth` | Initiate OAuth |
| `outlook-callback` | OAuth callback |
| `outlook-exchange` | Token exchange |
| `outlook-sync` | Sync inbox/sent |
| `outlook-send` | Send email |

**Token Storage:** `connected_mailboxes` table
- `email_address` - Connected email
- `provider` - gmail or outlook
- `access_token` - Encrypted access token
- `refresh_token` - Encrypted refresh token
- `sync_cursor` - Last sync position

---

### 5.4 TrueLayer (Open Banking)

**Purpose:** Bank account connection and transaction sync

**OAuth Flow:**
1. `truelayer-auth` generates auth link
2. User authenticates with bank
3. `truelayer-callback` receives tokens
4. Tokens stored in `bank_connections`

**Edge Functions:**
| Function | Purpose |
|----------|---------|
| `truelayer-auth` | Initiate connection |
| `truelayer-callback` | OAuth callback |
| `truelayer-sync` | Sync transactions |

**Token Storage:** `bank_connections` table
- `access_token` - TrueLayer access token
- `refresh_token` - Refresh token
- `consent_expires_at` - Consent expiration
- `bank_name` - Connected bank
- `status` - active, expired, revoked

---

### 5.5 Stripe Integration

**Purpose:** Subscription billing and client payments

**Edge Functions:**
| Function | Purpose |
|----------|---------|
| `stripe-checkout` | Create checkout session |
| `stripe-webhook` | Handle Stripe webhooks |
| `stripe-connect-onboard` | Connect onboarding |
| `stripe-connect-charge` | Process payments |
| `customer-portal` | Billing portal redirect |

**Webhook Events Handled:**
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

---

## 6. Workflows & State Machines

### 6.1 Job Lifecycle

```
┌─────────────┐
│ not_started │
└──────┬──────┘
       │ Start work
       ▼
┌─────────────┐     Request info    ┌──────────────┐
│ in_progress │────────────────────►│ awaiting_info│
└──────┬──────┘                     └──────┬───────┘
       │                                   │ Info received
       │◄──────────────────────────────────┘
       │
       │ Ready for review
       ▼
┌─────────────┐     Revisions needed
│   review    │──────────────────────┐
└──────┬──────┘                      │
       │ Approved                    │
       ▼                             │
┌─────────────┐                      │
│  complete   │◄─────────────────────┘
└─────────────┘

Parallel state: blocked (can occur at any stage)
```

**Job Status Values:**
- `not_started` - Created but no work begun
- `in_progress` - Active work
- `awaiting_info` - Waiting for client/external info
- `review` - Ready for manager review
- `complete` - Job finished
- `blocked` - Cannot proceed (parallel flag)

**Triggers:**
- Manual status change
- Task completion (all tasks done → review)
- Deadline approaching (automation)

---

### 6.2 Filing Lifecycle

```
┌─────────────┐
│ not_started │
└──────┬──────┘
       │ Begin preparation
       ▼
┌─────────────┐
│    draft    │
└──────┬──────┘
       │ Workpaper finalized
       ▼
┌─────────────┐
│ in_progress │
└──────┬──────┘
       │ Request client approval
       ▼
┌───────────────────┐    Client rejects    ┌──────────┐
│ awaiting_approval │─────────────────────►│ rejected │
└────────┬──────────┘                      └──────────┘
         │ Client approves
         ▼
┌───────────────┐
│ ready_to_file │
└───────┬───────┘
        │ Submit to HMRC/CH
        ▼
┌───────────────┐    API error    ┌────────┐
│   submitted   │────────────────►│ failed │
└───────┬───────┘                 └────────┘
        │ Confirmation received
        ▼
┌─────────────┐
│   filed     │
└─────────────┘
```

**Filing Status Values:**
- `not_started` - Filing record created
- `draft` - Preparing filing data
- `in_progress` - Active preparation
- `awaiting_approval` - Waiting for client
- `rejected` - Client rejected
- `ready_to_file` - Approved, ready to submit
- `submitted` - Sent to authority
- `failed` - Submission error
- `filed` - Successfully filed

---

### 6.3 Onboarding Workflow

```
┌──────────────┐
│ lead_created │
└──────┬───────┘
       │ Quote sent
       ▼
┌──────────────┐    Quote declined    ┌──────────┐
│  quote_sent  │─────────────────────►│ declined │
└──────┬───────┘                      └──────────┘
       │ Quote accepted
       ▼
┌────────────────────┐
│ onboarding_started │
└────────┬───────────┘
         │ AML documents submitted
         ▼
┌─────────────┐    Verification failed    ┌──────────────┐
│ aml_pending │──────────────────────────►│ aml_rejected │
└──────┬──────┘                           └──────────────┘
       │ AML verified
       ▼
┌──────────────┐
│ aml_verified │
└──────┬───────┘
       │ Engagement letter sent
       ▼
┌─────────────────┐
│ engagement_sent │
└────────┬────────┘
         │ Engagement signed
         ▼
┌───────────────────┐
│ engagement_signed │
└─────────┬─────────┘
          │ Setup complete
          ▼
     ┌────────┐
     │ active │
     └────────┘
```

---

### 6.4 Invoice Lifecycle

```
┌─────────┐
│  DRAFT  │
└────┬────┘
     │ Issue
     ▼
┌─────────┐
│ ISSUED  │
└────┬────┘
     │ Send to customer
     ▼
┌─────────┐
│  SENT   │
└────┬────┘
     │ Record payment
     ▼
┌───────────────────┐
│ AWAITING_PAYMENT  │
└─────────┬─────────┘
          │ Partial payment
          ▼
     ┌───────────┐
     │ PART_PAID │
     └─────┬─────┘
           │ Remaining paid
           ▼
      ┌────────┐
      │  PAID  │
      └────────┘

Void path: ISSUED/SENT → VOID (with reason)
```

---

### 6.5 Pay Run Lifecycle

```
┌─────────┐
│  draft  │
└────┬────┘
     │ Add employees, calculate
     ▼
┌─────────────┐
│ calculating │
└──────┬──────┘
       │ Calculations complete
       ▼
┌──────────┐
│ approved │
└────┬─────┘
     │ Submit RTI
     ▼
┌───────────┐    RTI error    ┌────────┐
│ submitted │────────────────►│ failed │
└─────┬─────┘                 └────────┘
      │ RTI accepted
      ▼
┌───────────┐
│ completed │
└───────────┘
```

---

## 7. Permissions & Access Control

### 7.1 Role Hierarchy

```
viewer < staff < manager < admin < owner
```

**Role Descriptions:**
- **Owner:** Full access, billing management, cannot be removed
- **Admin:** Full access except billing, can manage team
- **Manager:** Can approve filings, manage templates, supervise work
- **Staff:** Can create/edit jobs, basic bookkeeping
- **Viewer:** Read-only access

### 7.2 Permission Matrix

| Permission | Owner | Admin | Manager | Staff | Viewer |
|------------|:-----:|:-----:|:-------:|:-----:|:------:|
| **Practice Management** |
| can_manage_practice_settings | ✓ | ✓ | - | - | - |
| can_manage_integrations | ✓ | ✓ | - | - | - |
| can_manage_billing | ✓ | - | - | - | - |
| can_manage_team | ✓ | ✓ | - | - | - |
| **Automation** |
| can_manage_automation_rules | ✓ | ✓ | ✓ | - | - |
| can_view_automation_history | ✓ | ✓ | ✓ | ✓ | - |
| **Jobs & Workflow** |
| can_view_all_jobs | ✓ | ✓ | ✓ | ✓ | - |
| can_create_jobs | ✓ | ✓ | ✓ | ✓ | - |
| can_manage_templates | ✓ | ✓ | ✓ | - | - |
| **Filing** |
| can_finalize_workpapers | ✓ | ✓ | ✓ | - | - |
| can_approve_filings | ✓ | ✓ | ✓ | - | - |
| can_submit_filings | ✓ | ✓ | ✓ | - | - |
| **Data Access** |
| can_view_sensitive_data | ✓ | ✓ | ✓ | - | - |
| can_delete_records | ✓ | ✓ | - | - | - |
| **Email** |
| can_send_emails | ✓ | ✓ | ✓ | ✓ | - |
| can_manage_email_queue | ✓ | ✓ | ✓ | - | - |
| can_access_shared_mailbox | ✓ | ✓ | ✓ | ✓ | - |
| **Bookkeeping - Invoices** |
| can_create_invoices | ✓ | ✓ | ✓ | ✓ | - |
| can_edit_invoices | ✓ | ✓ | ✓ | ✓ | - |
| can_issue_invoices | ✓ | ✓ | ✓ | - | - |
| can_void_unpaid_invoices | ✓ | ✓ | ✓ | - | - |
| can_void_paid_invoices | ✓ | ✓ | - | - | - |
| **Bookkeeping - Bills** |
| can_manage_bills | ✓ | ✓ | ✓ | ✓ | - |
| can_approve_bills | ✓ | ✓ | ✓ | - | - |
| can_void_bills | ✓ | ✓ | ✓ | - | - |
| **Bookkeeping - Payments & Journals** |
| can_record_payments | ✓ | ✓ | ✓ | ✓ | - |
| can_reverse_payments | ✓ | ✓ | ✓ | - | - |
| can_post_journals | ✓ | ✓ | ✓ | - | - |
| can_reverse_journals | ✓ | ✓ | ✓ | - | - |
| **Bank & Reconciliation** |
| can_manage_bank_reconciliation | ✓ | ✓ | ✓ | - | - |
| can_manage_bank_rules | ✓ | ✓ | ✓ | - | - |
| can_match_payments | ✓ | ✓ | ✓ | ✓ | - |
| **Period & Override** |
| can_lock_periods | ✓ | ✓ | - | - | - |
| can_override_locked_records | ✓ | ✓ | - | - | - |
| **Customers & Suppliers** |
| can_manage_customers | ✓ | ✓ | ✓ | ✓ | - |
| can_manage_suppliers | ✓ | ✓ | ✓ | ✓ | - |

### 7.3 Row-Level Security

All tables implement RLS with organization-level isolation:

```sql
-- Standard RLS pattern
CREATE POLICY "Users can access own organization data"
ON table_name
FOR ALL
USING (organization_id IN (
  SELECT organization_id 
  FROM organization_users 
  WHERE user_id = auth.uid()
));
```

**Special Cases:**
- `questionnaire_instances` - Public access for response submission
- `email_messages` - Filtered by mailbox access
- `filing_approvals` - Client access via approval tokens

---

## 8. Edge Functions Inventory

### 8.1 HMRC Functions

| Function | JWT | Purpose | Input | Output |
|----------|-----|---------|-------|--------|
| `hmrc-auth` | Yes | Initiate OAuth | org_id, scopes | OAuth URL |
| `hmrc-callback` | No | Handle OAuth callback | code, state | Success/error |
| `hmrc-vat-submit` | Yes | Submit VAT return | filing_id | Submission result |
| `hmrc-vat-obligations` | Yes | Fetch VAT obligations | vrn, from, to | Obligations list |
| `hmrc-ct-submit` | Yes | Submit CT600 | filing_id | Submission ID |
| `hmrc-ct-poll` | Yes | Poll CT600 status | submission_id | Status |
| `hmrc-ct-delete` | Yes | Delete pending CT600 | submission_id | Success |

### 8.2 Companies House Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `companies-house-sync` | Yes | Sync company data from CH API |
| `ch-submit` | Yes | Submit filings to CH |

### 8.3 Email Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `gmail-auth` | Yes | Initiate Gmail OAuth |
| `gmail-callback` | No | Handle Gmail OAuth callback |
| `gmail-exchange` | Yes | Exchange Gmail auth code |
| `gmail-sync` | Yes | Sync Gmail messages |
| `gmail-send` | Yes | Send email via Gmail |
| `outlook-auth` | Yes | Initiate Outlook OAuth |
| `outlook-callback` | No | Handle Outlook OAuth callback |
| `outlook-exchange` | Yes | Exchange Outlook auth code |
| `outlook-sync` | Yes | Sync Outlook messages |
| `outlook-send` | Yes | Send email via Outlook |
| `send-email` | Yes | Generic email sending |
| `send-engagement-letter` | Yes | Send engagement letter |

### 8.4 Banking Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `truelayer-auth` | Yes | Initiate TrueLayer OAuth |
| `truelayer-callback` | No | Handle TrueLayer callback |
| `truelayer-sync` | Yes | Sync bank transactions |
| `fx-rates` | Yes | Fetch exchange rates |

### 8.5 Payment Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `stripe-checkout` | Yes | Create checkout session |
| `stripe-webhook` | No | Handle Stripe webhooks |
| `stripe-connect-onboard` | Yes | Stripe Connect onboarding |
| `stripe-connect-charge` | Yes | Process Connect charge |
| `customer-portal` | Yes | Billing portal redirect |
| `check-subscription` | Yes | Validate subscription status |

### 8.6 Filing Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `generate-filing-pdf` | Yes | Generate filing PDF |
| `rti-submit` | Yes | Submit RTI to HMRC |
| `cis-submit` | Yes | Submit CIS return |

### 8.7 Background Functions

| Function | JWT | Purpose |
|----------|-----|---------|
| `process-automation-events` | No | Process automation queue |
| `process-email-queue` | No | Send queued emails |
| `sla-check` | No | Check SLA breaches |
| `session-cleanup` | No | Clean expired sessions |

---

## 9. Technical Architecture

### 9.1 Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| shadcn/ui | Latest | Component library |
| TanStack Query | 5.x | Data fetching |
| React Router | 6.x | Routing |
| React Hook Form | 7.x | Form management |
| Zod | 3.x | Schema validation |
| Recharts | 2.x | Charts |
| date-fns | 3.x | Date manipulation |
| Lucide React | Latest | Icons |

### 9.2 Component Organization

```
src/
├── components/
│   ├── ui/                    # 50+ shadcn components
│   ├── bookkeeping/           # 35 bookkeeping components
│   │   ├── BankingTab.tsx
│   │   ├── InvoicesTab.tsx
│   │   ├── BillsTab.tsx
│   │   └── ...
│   ├── jobs/                  # 15 job components
│   ├── cosec/                 # 15 company secretary components
│   ├── payroll/               # 12 payroll components
│   ├── cis/                   # 5 CIS components
│   ├── email/                 # 8 email components
│   ├── templates/             # 6 template editors
│   ├── workpaper/             # 5 workpaper components
│   ├── automations/           # 6 automation components
│   ├── dashboard/             # 6 dashboard widgets
│   ├── clients/               # Client management
│   ├── contacts/              # Contact management
│   ├── documents/             # Document handling
│   ├── onboarding/            # Onboarding flow
│   └── ...
├── lib/                       # 75+ service files
│   ├── *-service.ts           # Domain services
│   ├── *-engine.ts            # Computation engines
│   └── ...
├── pages/                     # 43 page components
├── hooks/                     # Custom React hooks
└── integrations/
    └── supabase/              # Auto-generated types
```

### 9.3 Backend Architecture

**Supabase Components:**
- PostgreSQL database
- Auth (email/password, magic link)
- Storage (documents, attachments)
- Edge Functions (Deno runtime)
- Realtime (WebSocket subscriptions)

**Database Design:**
- Multi-tenant via `organization_id`
- Row-Level Security on all tables
- UUID primary keys
- Soft delete via `archived_at` where applicable
- Audit logging via triggers

**Edge Function Runtime:**
- Deno 1.x
- TypeScript
- Shared modules in `_shared/`
- CORS handling
- Rate limiting
- Idempotency keys

### 9.4 Key Libraries (lib/)

| File | Purpose |
|------|---------|
| `auth-context.tsx` | Authentication state |
| `app-context.tsx` | Global app state |
| `permissions.ts` | Role/permission definitions |
| `permission-service.ts` | Permission checking |
| `invoice-service.ts` | Invoice CRUD |
| `bills-service.ts` | Bill CRUD |
| `posting-service.ts` | Ledger posting |
| `filing-service.ts` | Filing management |
| `ct600-xml-builder.ts` | CT600 XML generation |
| `ixbrl-generator.ts` | iXBRL generation |
| `payroll-calculation-engine.ts` | Payroll calculations |
| `rti-submission-engine.ts` | RTI XML generation |
| `automation-engine.ts` | Automation execution |
| `deadline-engine.ts` | Deadline calculation |
| `matching-service.ts` | Payment matching |

---

## 10. Known Gaps & TODOs

### 10.1 Partially Implemented Features

| Feature | Status | Notes |
|---------|--------|-------|
| Self-Assessment Filing | UI exists | HMRC SA API integration pending |
| MTD for Income Tax | Not started | Awaiting HMRC API availability |
| Client Portal App | Schema ready | Separate app not built |
| Document Signing | Basic signature | No DocuSign/Adobe Sign integration |
| Multi-currency Bookkeeping | FX columns exist | Full revaluation not implemented |
| Bank Feed Reconciliation | Basic matching | AI-assisted matching not built |
| Time & Billing | Time entries exist | Billing integration incomplete |

### 10.2 Stubbed/Mocked Integrations

| Integration | Current State | Production State |
|-------------|---------------|------------------|
| Companies House Filing | Sandbox only | Need live credentials |
| HMRC CT600 | Sandbox testing | Need live registration |
| HMRC VAT | Sandbox | Need live production approval |
| TrueLayer | Sandbox bank | Need production agreement |

### 10.3 Known Technical Debt

| Issue | Impact | Priority |
|-------|--------|----------|
| Client type mismatch (`ltd` vs `limited_company`) | Data inconsistency | Medium |
| Some RLS policies too permissive | Security | High |
| Large page components need splitting | Maintainability | Medium |
| Test coverage gaps | Quality | Medium |
| Automation rate limiting needs tuning | Performance | Low |
| Email sync pagination incomplete | Data completeness | Medium |

### 10.4 Future Considerations

1. **Client Portal Separation**
   - Separate React app for clients
   - Authentication via magic links
   - Limited data exposure

2. **Mobile App**
   - React Native or PWA
   - Document upload focus
   - Push notifications

3. **AI Enhancements**
   - Receipt OCR
   - Bank transaction categorization
   - Email auto-tagging

4. **Advanced Reporting**
   - Custom report builder
   - Scheduled report delivery
   - Practice analytics dashboard

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | System | Initial generation |

---

*This document is auto-generated and should be regenerated when significant changes are made to the application.*

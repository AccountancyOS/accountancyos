# AccountancyOS - Comprehensive Project Documentation

**Last Updated:** February 2026
**Version:** 1.0
**Purpose:** Complete technical and functional documentation for third-party review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Project Architecture](#3-project-architecture)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Database Schema Overview](#5-database-schema-overview)
6. [Page-by-Page Documentation](#6-page-by-page-documentation)
7. [Data Flow Patterns](#7-data-flow-patterns)
8. [Key Business Logic Services](#8-key-business-logic-services)
9. [Status Assessment: What's Working & What Isn't](#9-status-assessment-whats-working--what-isnt)
10. [API & Edge Functions](#10-api--edge-functions)
11. [Third-Party Integrations](#11-third-party-integrations)

---

## 1. Executive Summary

**AccountancyOS** is a full-stack SaaS web application designed for UK accounting practices. It provides comprehensive practice management, compliance filing, bookkeeping, payroll, and client relationship management functionality.

### Core Capabilities

| Module | Description | Status |
|--------|-------------|--------|
| CRM & Leads | Prospect management, company lookup | Working |
| Client Management | Individual and company client records | Working |
| Jobs & Workflow | Task management, deadline tracking | Working |
| Bookkeeping | Chart of accounts, invoicing, bills, bank reconciliation | Working |
| Filings & Compliance | CT600, VAT, SA100, CIS returns | Working |
| Payroll | PAYE, RTI submissions | Working |
| Automations | Rule-based workflow automation | Working |
| Client Portal | External client access | Working |
| Email Management | Gmail/Outlook integration | Partially Working |

### Key Metrics

- **52 Pages/Routes** in the application
- **255+ Components** organized into 26 categories
- **80+ Service files** for business logic
- **40+ Edge Functions** for server-side operations
- **13,500+ lines** of auto-generated database types

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8 | Type safety |
| Vite | 5.4 | Build tool & dev server |
| React Router | 6.30 | Client-side routing |
| TanStack React Query | 5.83 | Server state management |
| Tailwind CSS | 3.4 | Styling |
| shadcn/ui | Latest | Component library |
| Radix UI | 1.x | Headless UI primitives |

### Backend

| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL database, authentication, realtime, edge functions |
| PostgREST | Auto-generated REST API |
| Supabase Auth | User authentication & sessions |
| Edge Functions (Deno) | Serverless backend logic |

### Key Libraries

| Library | Purpose |
|---------|---------|
| React Hook Form + Zod | Form management and validation |
| Recharts | Data visualization |
| date-fns | Date manipulation |
| Lucide React | Icons |
| DOMPurify | HTML sanitization |
| PapaParse | CSV parsing |
| @dnd-kit | Drag and drop |
| mathjs | Mathematical calculations |

---

## 3. Project Architecture

### Directory Structure

```
/accountancyos
├── src/
│   ├── App.tsx                    # Main router (479 lines)
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Global Tailwind styles
│   │
│   ├── pages/                     # 52 page components
│   │   ├── Index.tsx              # Landing/redirect page
│   │   ├── Overview.tsx           # Main dashboard
│   │   ├── WelcomeDashboard.tsx   # Onboarding flow
│   │   ├── Clients.tsx            # Client list
│   │   ├── ClientPortal.tsx       # Individual client view
│   │   ├── CompanyDetail.tsx      # Company details
│   │   ├── Jobs.tsx               # Jobs list
│   │   ├── JobDetail.tsx          # Job details with tabs
│   │   ├── Bookkeeping.tsx        # Full bookkeeping module
│   │   ├── Filings.tsx            # Filings list
│   │   ├── FilingDetail.tsx       # Filing details
│   │   ├── Payroll.tsx            # Payroll module
│   │   ├── CIS.tsx                # CIS returns
│   │   ├── ... (38 more pages)
│   │
│   ├── components/                # 255+ reusable components
│   │   ├── ui/                    # 55 shadcn/ui components
│   │   ├── bookkeeping/           # 25+ bookkeeping components
│   │   ├── jobs/                  # 16 job management components
│   │   ├── client-portal/         # 12 portal components
│   │   ├── filings/               # Filing components
│   │   ├── payroll/               # Payroll components
│   │   ├── ... (20 more categories)
│   │
│   ├── lib/                       # 80+ service files
│   │   ├── auth-context.tsx       # Authentication state
│   │   ├── app-context.tsx        # Global app state
│   │   ├── permissions.ts         # RBAC system
│   │   ├── filing-service.ts      # Filing operations
│   │   ├── ct-computation-engine.ts # Tax calculations
│   │   ├── ... (75 more services)
│   │
│   ├── hooks/                     # 8 custom React hooks
│   │   ├── usePermissions.ts
│   │   ├── useRealtimeSubscription.ts
│   │   └── ...
│   │
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts          # Supabase client config
│   │       └── types.ts           # Generated DB types (13,510 lines)
│   │
│   └── types/                     # TypeScript definitions
│
├── supabase/
│   ├── migrations/                # Database migrations
│   └── functions/                 # 40+ edge functions
│
└── public/                        # Static assets
```

### Routing Architecture

**File:** `src/App.tsx`

Routes are organized into:

1. **Public Routes** - No authentication required
   - `/auth` - Login/signup
   - `/confirm-email` - Email verification
   - `/questionnaire/:instanceId` - Public questionnaire responses

2. **Protected Routes** - Require authentication
   - All other routes wrapped in `<ProtectedRoute>`
   - Wrapped by `AppProvider` for organization context

```tsx
// Route protection pattern
<Route
  path="/protected-page"
  element={
    <ProtectedRoute>
      <ProtectedPage />
    </ProtectedRoute>
  }
/>
```

---

## 4. Authentication & Authorization

### Authentication Flow

**File:** `src/lib/auth-context.tsx`

1. User lands on `/auth` page
2. Supabase Auth handles email/password login
3. On success, session stored in localStorage
4. `AuthContext` provides session state to app
5. Protected routes check session existence

### Session Management

```typescript
// AuthContext provides:
{
  session: Session | null,        // Supabase session
  user: User | null,              // Current user
  isLoading: boolean,             // Loading state
  signOut: () => Promise<void>,   // Logout function
}
```

### Role-Based Access Control (RBAC)

**File:** `src/lib/permissions.ts`

#### Role Hierarchy (lowest to highest)

| Role | Level | Description |
|------|-------|-------------|
| `viewer` | 1 | Read-only access |
| `staff` | 2 | Basic operations |
| `manager` | 3 | Most operations |
| `admin` | 4 | Administrative access |
| `owner` | 5 | Full access |

#### Permission Categories

| Category | Permissions | Allowed Roles |
|----------|-------------|---------------|
| Practice Management | `can_manage_practice_settings`, `can_manage_integrations`, `can_manage_billing`, `can_manage_team` | owner, admin |
| Automation | `can_manage_automation_rules`, `can_view_automation_history` | owner, admin, manager |
| Jobs | `can_view_all_jobs`, `can_create_jobs`, `can_manage_templates` | owner, admin, manager, staff |
| Filing | `can_finalize_workpapers`, `can_approve_filings`, `can_submit_filings` | owner, admin, manager |
| Bookkeeping | `can_create_invoices`, `can_issue_invoices`, `can_post_journals`, etc. | varies by action |
| Data | `can_view_sensitive_data`, `can_delete_records` | owner, admin, manager |

#### Permission Check Usage

```tsx
// Using the hook
const { can_approve_filings } = usePermissions(['can_approve_filings']);

// Using the guard component
<RequirePermission permission="can_approve_filings">
  <ApproveButton />
</RequirePermission>
```

---

## 5. Database Schema Overview

The application uses Supabase PostgreSQL with row-level security (RLS). All tables are scoped to `organization_id` for multi-tenancy.

### Core Entity Tables

#### Organizations & Users

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `organizations` | Practice/firm records | `id`, `name`, `setup_dismissed` |
| `organization_users` | Team members | `organization_id`, `user_id`, `role` |
| `organization_subscription_cache` | Cached subscription status | `tier`, `is_active` |
| `organization_branding` | Branding settings | `logo_light_url`, `accent_color` |

#### Clients & Companies

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `clients` | Individual clients | `id`, `organization_id`, `first_name`, `last_name`, `client_type`, `status` |
| `client_detail_sa` | Self-assessment details | `client_id`, `utr`, `nino` |
| `client_detail_cgt` | CGT client details | `client_id`, `disposal_date` |
| `client_detail_partnership` | Partnership details | `client_id`, `partner_count` |
| `client_detail_charity` | Charity details | `client_id`, `charity_number` |
| `companies` | Limited companies, LLPs | `id`, `organization_id`, `company_name`, `company_number` |
| `company_officers` | Directors/secretaries | `company_id`, `name`, `role` |
| `company_shareholders` | Shareholders | `company_id`, `name`, `share_count` |
| `company_pscs` | Persons with significant control | `company_id`, `name` |

#### Client Types Mapping

**File:** `src/lib/client-types.ts`

| Client Type | Detail Table | Uses Company Record |
|-------------|--------------|---------------------|
| `sa_non_mtd` | `client_detail_sa` | No |
| `sa_mtd` | `client_detail_sa` | No |
| `sole_trader` | `client_detail_sa` | No |
| `landlord` | `client_detail_sa` | No |
| `partnership` | `client_detail_partnership` | No |
| `llp` | `companies` | Yes |
| `limited_company` | `companies` | Yes |
| `charity` | `client_detail_charity` | No |
| `cgt` | `client_detail_cgt` | No |

### Jobs & Workflow Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `jobs` | Work items | `id`, `job_name`, `status`, `client_id`, `company_id`, `owner_id` |
| `job_templates` | Reusable job templates | `name`, `default_tasks`, `service_type` |
| `client_tasks` | Tasks within jobs | `job_id`, `title`, `status`, `assigned_to` |
| `client_messages` | Internal job notes | `job_id`, `message`, `created_by` |
| `deadlines` | Statutory/internal deadlines | `due_date`, `entity_id`, `status`, `risk_level` |

### Bookkeeping Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `bookkeeping_accounts` | Chart of accounts | `code`, `name`, `type`, `parent_id` |
| `bank_accounts` | Bank connections | `account_name`, `account_number`, `balance` |
| `bank_transactions` | Bank transactions | `amount`, `date`, `description`, `categorized` |
| `bank_rules` | Auto-categorization rules | `pattern`, `account_id`, `is_active` |
| `invoices` | Sales invoices | `invoice_number`, `customer_id`, `total`, `status` |
| `invoice_lines` | Invoice line items | `invoice_id`, `description`, `quantity`, `unit_price` |
| `bills` | Purchase bills | `bill_number`, `supplier_id`, `total`, `status` |
| `bill_lines` | Bill line items | `bill_id`, `description`, `amount` |
| `customers` | Customer/debtor records | `name`, `email`, `balance` |
| `contacts` | Supplier contacts | `name`, `email` |
| `vat_periods` | VAT periods | `start_date`, `end_date`, `status` |

### Filing Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `filings` | Tax returns and filings | `filing_type`, `status`, `tax_year`, `filing_body` |
| `filing_submissions` | Submission records | `filing_id`, `submitted_at`, `response` |
| `filing_approvals` | Approval workflow | `filing_id`, `approved_by`, `approved_at` |
| `filing_artefacts` | Generated documents | `filing_id`, `type`, `url` |
| `workpaper_instances` | Engagement workpapers | `service_type`, `status`, `field_values` |

### Payroll Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `paye_schemes` | PAYE scheme setup | `employer_ref`, `accounts_office_ref` |
| `employees` | Employee records | `first_name`, `last_name`, `ni_number`, `tax_code` |
| `pay_runs` | Pay run records | `period_start`, `period_end`, `status` |
| `rti_submissions` | RTI to HMRC | `pay_run_id`, `submission_type`, `status` |

### Email Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `email_queue` | Outgoing email queue | `to_email`, `subject`, `status`, `context` |
| `connected_mailboxes` | Gmail/Outlook connections | `provider`, `email_address`, `is_active` |
| `email_messages` | Sent email history | `subject`, `sent_at`, `recipient` |

---

## 6. Page-by-Page Documentation

### 6.1 Index Page (`/`)

**File:** `src/pages/Index.tsx`

**Purpose:** Landing page that redirects based on user state

**Data Flow:**
1. Checks if user is authenticated
2. If not authenticated → redirects to `/auth`
3. If authenticated:
   - Checks `organization.setup_dismissed`
   - If setup not dismissed → redirects to `/welcome`
   - If setup dismissed → redirects to `/overview`

**Status:** ✅ Working

---

### 6.2 Welcome Dashboard (`/welcome`)

**File:** `src/pages/WelcomeDashboard.tsx`

**Purpose:** Onboarding checklist for new users

**UI Elements:**
- Progress bar showing setup completion
- Checklist of 4 items:
  1. Confirm branding → links to `/settings/branding`
  2. Import clients → links to `/clients`
  3. Add first lead → links to `/crm`
  4. Connect Companies House & HMRC → links to `/settings/hmrc`
- Skip Setup button
- Quick Actions cards (Create Lead, Create Quote, Add Client, Import Data)

**Data Sources:**

| Field | Source Table | Query |
|-------|--------------|-------|
| Branding completion | `organization_branding` | Checks if `logo_light_url`, `logo_dark_url`, `trading_name`, or non-default `accent_color` exists |
| Client count | `clients` | COUNT where `organization_id` matches |
| Lead count | `leads` | COUNT where `organization_id` matches |
| HMRC connected | `organization_integrations_hmrc` | Checks `mtd_vat_connected` |
| CH connected | `organization_integrations_companies_house` | Checks `connected_at` |

**Data Flow:**
1. On mount, fetches completion status for all checklist items
2. When all items complete OR user clicks "Skip Setup":
   - Updates `organizations.setup_dismissed = true`
   - Redirects to `/overview`

**Status:** ✅ Working

---

### 6.3 Overview Dashboard (`/overview`)

**File:** `src/pages/Overview.tsx`

**Purpose:** Main dashboard with KPIs and activity overview

**UI Elements:**
- KPI Cards row (4 cards)
- Upcoming Deadlines widget
- Jobs Pipeline widget
- Recent Activity feed
- Staff Performance widget (if manager+)

**Data Sources (KPI Cards):**

| KPI | Source | Query |
|-----|--------|-------|
| Active Clients | `clients` | COUNT where `status = 'active'` |
| Jobs In Progress | `jobs` | COUNT where `status IN ('in_progress', 'waiting_on_client', 'ready_for_review')` |
| Overdue Deadlines | `deadlines` | COUNT where `status = 'pending'` AND `due_date < NOW()` |
| Automation Success | `automation_executions` | `completed / total * 100` for last 30 days |

**Real-time Updates:**
- Uses `useRealtimeSubscription` hook for:
  - `jobs` table
  - `deadlines` table
  - `clients` table

**Status:** ✅ Working

---

### 6.4 Clients List (`/clients`)

**File:** `src/pages/Clients.tsx`

**Purpose:** List and manage all clients (individuals and companies)

**UI Elements:**
- Search bar (searches name, email, company)
- Filter dropdowns:
  - Client Type (all types from `CLIENT_TYPES`)
  - Status (active, inactive, prospect)
- View toggle (Card/Table view)
- "Add Client" button → opens `CreateClientDialog`
- "Import" button → opens `ImportClientsDialog`
- Client cards/rows showing:
  - Name
  - Client type badge
  - Email
  - Status badge
  - Click → navigates to `/clients/:clientId`

**Data Sources:**

| Field | Source | Column |
|-------|--------|--------|
| Client name | `clients` | `first_name`, `last_name` OR `companies.company_name` |
| Client type | `clients` | `client_type` |
| Email | `clients` | `email` |
| Status | `clients` | `status` |
| Company name | `companies` (joined) | `company_name` |

**Query Pattern:**
```typescript
supabase
  .from("clients")
  .select(`
    *,
    companies(company_name, company_number)
  `)
  .eq("organization_id", organization.id)
  .order("created_at", { ascending: false })
```

**Data Flow:**
1. Fetches clients with optional company join
2. Client-side filtering by search term and filters
3. Clicking client navigates to portal
4. Creating client triggers job creation via automations

**Status:** ✅ Working

---

### 6.5 Client Portal (`/clients/:clientId`)

**File:** `src/pages/ClientPortal.tsx`

**Purpose:** Complete view of a single client with all related data

**UI Elements (Tabs):**
1. **Overview Tab** - Summary cards, quick stats
2. **Engagements Tab** - Active services/jobs
3. **Messages Tab** - Client communications
4. **Deadlines Tab** - Upcoming deadlines
5. **Documents Tab** - Uploaded files
6. **Workpapers Tab** - Engagement workpapers
7. **Questionnaires Tab** - Sent questionnaires
8. **Filings Tab** - Filing history
9. **Bookkeeping Tab** - If bookkeeping enabled

**Data Sources (Overview Tab):**

| Field | Source | Query |
|-------|--------|-------|
| Client details | `clients` | WHERE `id = :clientId` |
| Company details | `companies` | If company-based type |
| SA details | `client_detail_sa` | If SA client type |
| Active jobs count | `jobs` | COUNT WHERE `client_id` AND `status != 'completed'` |
| Pending deadlines | `deadlines` | COUNT WHERE `entity_id` AND `status = 'pending'` |
| Outstanding balance | `invoices` | SUM WHERE `status != 'paid'` |

**Data Flow:**
1. URL param `clientId` used to fetch client record
2. Client type determines which detail table to join
3. Each tab lazily loads its own data
4. Real-time subscription for messages

**Status:** ✅ Working

---

### 6.6 Company Detail (`/companies/:companyId`)

**File:** `src/pages/CompanyDetail.tsx`

**Purpose:** Detailed view for limited companies, LLPs, charities

**UI Elements (Tabs):**
1. **Overview Tab** - Company info, incorporation details
2. **Officers Tab** - Directors, secretaries
3. **Shareholders Tab** - Share structure
4. **PSCs Tab** - Persons with significant control
5. **Filings Tab** - Companies House filings
6. **COSEC Tab** - Company secretarial actions
7. **Accounts Tab** - Bookkeeping access
8. **Jobs Tab** - Related jobs

**Data Sources:**

| Field | Source | Column |
|-------|--------|--------|
| Company name | `companies` | `company_name` |
| Company number | `companies` | `company_number` |
| Status | `companies` | `company_status` |
| Incorporation date | `companies` | `incorporated_on` |
| Registered address | `companies` | `registered_office_*` fields |
| SIC codes | `companies` | `sic_codes` (JSON array) |
| Officers | `company_officers` | All where `company_id` |
| Shareholders | `company_shareholders` | All where `company_id` |
| PSCs | `company_pscs` | All where `company_id` |
| Accounting ref date | `companies` | `accounting_reference_date` |

**Companies House Sync:**
- "Sync from Companies House" button
- Calls `companies-house-sync` edge function
- Updates company data, officers, PSCs

**Status:** ✅ Working

---

### 6.7 Jobs List (`/jobs`)

**File:** `src/pages/Jobs.tsx`

**Purpose:** Practice-wide job/work item management

**UI Elements:**
- Quick filter buttons (My Jobs, All Open, Waiting on Client, Due This Week)
- Advanced filters panel:
  - Service type
  - Status
  - Assigned to
  - Client/Company
  - Date range
- Saved views dropdown
- "Create Job" button
- Jobs table with columns:
  - Job name
  - Client/Company
  - Service type
  - Status
  - Owner
  - Due date
  - Priority indicator

**Data Sources:**

| Field | Source | Column |
|-------|--------|--------|
| Job name | `jobs` | `job_name` |
| Status | `jobs` | `status` |
| Service type | `jobs` | `service_type` |
| Client name | `clients` (joined) | `first_name`, `last_name` |
| Company name | `companies` (joined) | `company_name` |
| Owner | `organization_users` (joined) | User name |
| Due date | `jobs` | `due_date` |
| Priority | `jobs` | `priority` |

**Job Statuses:**
- `not_started`
- `in_progress`
- `waiting_on_client`
- `ready_for_review`
- `in_review`
- `completed`
- `cancelled`

**Data Flow:**
1. Initial load fetches jobs with filters
2. Filters applied server-side via query params
3. Saved views stored in localStorage
4. Real-time updates via subscription

**Status:** ✅ Working

---

### 6.8 Job Detail (`/jobs/:jobId`)

**File:** `src/pages/JobDetail.tsx`

**Purpose:** Full job management with tasks, documents, filings

**UI Elements (Tabs):**
1. **Overview Tab** - Job summary, status, dates
2. **Tasks Tab** - Task checklist
3. **Documents Tab** - File attachments
4. **Timeline Tab** - Activity history
5. **Records Request Tab** - Information requests to client
6. **Workpapers Tab** - Related workpapers
7. **Filing Tab** - If filing-related job
8. **Conversation Tab** - Internal notes

**Data Sources:**

| Field | Source | Query |
|-------|--------|-------|
| Job details | `jobs` | WHERE `id = :jobId` |
| Tasks | `client_tasks` | WHERE `job_id = :jobId` |
| Documents | `documents` | WHERE `job_id = :jobId` |
| Timeline events | `client_messages` + audit | WHERE `job_id` |
| Workpapers | `workpaper_instances` | WHERE `job_id = :jobId` |
| Filing | `filings` | WHERE `job_id = :jobId` |

**Task Management:**
- Create task with title, description, assignee, due date
- Check/uncheck completion
- Task ordering via drag-and-drop
- Task templates from job templates

**Status:** ✅ Working

---

### 6.9 Bookkeeping Module (`/bookkeeping`)

**File:** `src/pages/Bookkeeping.tsx`

**Purpose:** Full double-entry bookkeeping system

**UI Elements (Tabs):**
1. **Overview Tab** - Business KPIs, charts
2. **Chart of Accounts Tab** - Account tree
3. **Banking Tab** - Bank accounts, transactions
4. **Sales Tab** - Invoicing module
5. **Purchases Tab** - Bills module
6. **Journals Tab** - Manual journal entries
7. **VAT Returns Tab** - VAT period management
8. **Reports Tab** - P&L, Balance Sheet, Trial Balance
9. **Period Lock Tab** - Period closing

**Entity Selector:**
- Top dropdown to select client or company
- All data scoped to selected entity

### Overview Tab

**KPIs Displayed:**
| KPI | Calculation |
|-----|-------------|
| Revenue MTD | SUM of sales invoices this month |
| Expenses MTD | SUM of bills this month |
| Bank Balance | Total across all bank accounts |
| AR Balance | Unpaid invoice total |
| AP Balance | Unpaid bills total |

### Chart of Accounts Tab

**Data Source:** `bookkeeping_accounts`

| Field | Column |
|-------|--------|
| Account code | `code` |
| Account name | `name` |
| Type | `type` (asset, liability, equity, income, expense) |
| Parent | `parent_id` (for hierarchy) |
| Balance | Calculated from postings |

**Features:**
- Hierarchical tree view
- Standard UK COA template seeding
- Custom account creation
- Account archiving

### Banking Tab

**Data Sources:**
| Data | Table |
|------|-------|
| Bank accounts | `bank_accounts` |
| Transactions | `bank_transactions` |
| Rules | `bank_rules` |

**Features:**
- Manual transaction entry
- TrueLayer bank sync (where connected)
- Rule-based auto-categorization
- Bank reconciliation

### Sales Tab (Invoicing)

**Invoice Workflow:**
```
Draft → Issued → Sent → Partially Paid → Paid
                  ↘ Overdue
                      ↘ Void
```

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Invoice number | `invoices` | `invoice_number` |
| Customer | `customers` | via `customer_id` |
| Date | `invoices` | `invoice_date` |
| Due date | `invoices` | `due_date` |
| Subtotal | `invoices` | `subtotal` |
| VAT | `invoices` | `vat_amount` |
| Total | `invoices` | `total` |
| Status | `invoices` | `status` |
| Line items | `invoice_lines` | linked by `invoice_id` |

**Line Item Fields:**
- Description
- Quantity
- Unit price
- VAT rate
- Account (for posting)

### Purchases Tab (Bills)

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Bill reference | `bills` | `bill_number` |
| Supplier | `contacts` | via `supplier_id` |
| Date | `bills` | `bill_date` |
| Due date | `bills` | `due_date` |
| Total | `bills` | `total` |
| Status | `bills` | `status` |
| Line items | `bill_lines` | linked by `bill_id` |

### VAT Returns Tab

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Period | `vat_periods` | `start_date`, `end_date` |
| Status | `vat_periods` | `status` |
| Box values | Calculated | From transactions |

**VAT Boxes (UK):**
- Box 1: VAT due on sales
- Box 2: VAT due on acquisitions
- Box 3: Total VAT due
- Box 4: VAT reclaimed
- Box 5: Net VAT
- Box 6-9: Sales/purchases totals

**Status:** ✅ Working - Full bookkeeping functionality operational

---

### 6.10 Filings List (`/filings`)

**File:** `src/pages/Filings.tsx`

**Purpose:** View all tax filings across the practice

**UI Elements:**
- Filter by filing type (CT600, VAT, SA100, CIS, RTI)
- Filter by status
- Filter by client/company
- Filings table with:
  - Filing type badge
  - Entity name
  - Period
  - Status
  - Due date
  - Actions

**Data Sources:**
```typescript
supabase
  .from("filings")
  .select(`
    *,
    clients(first_name, last_name),
    companies(company_name),
    jobs(job_name)
  `)
  .eq("organization_id", organization.id)
```

**Filing Types:**
| Type | Body | Description |
|------|------|-------------|
| `ct600` | HMRC | Corporation Tax return |
| `vat_return` | HMRC | VAT return |
| `self_assessment` | HMRC | SA100 personal tax |
| `cis_return` | HMRC | CIS monthly return |
| `rti` | HMRC | Real Time Information payroll |
| `accounts` | CH | Annual accounts filing |
| `confirmation_statement` | CH | CS01 |

**Status:** ✅ Working

---

### 6.11 Filing Detail (`/filings/:filingId`)

**File:** `src/pages/FilingDetail.tsx`

**Purpose:** Complete filing management and submission

**UI Elements (Tabs):**
1. **Summary Tab** - Filing overview, tax position
2. **Data Tab** - Editable filing data (if draft)
3. **Computation Tab** - Tax calculation breakdown
4. **Validation Tab** - Pre-submission checks
5. **Documents Tab** - Generated PDFs, iXBRL
6. **Submissions Tab** - Submission history

**Filing Workflow:**
```
draft → awaiting_approval → approved → ready_to_file → filed
                              ↘ rejected (loops back)
```

**Data Sources:**

| Field | Table | Column |
|-------|-------|--------|
| Filing type | `filings` | `filing_type` |
| Status | `filings` | `status` |
| Tax year | `filings` | `tax_year` |
| Period | `filings` | `period_start`, `period_end` |
| Filing data | `filings` | `filing_data` (JSONB) |
| Tax due | `filings` | `tax_due` |
| Approvals | `filing_approvals` | linked records |
| Submissions | `filing_submissions` | linked records |
| Documents | `filing_artefacts` | linked records |

**Tax Calculation (CT600):**
**File:** `src/lib/ct-computation-engine.ts`

| Field | Source |
|-------|--------|
| Trading profit | Workpaper field_values |
| Other income | Workpaper field_values |
| Total profits | Calculated |
| Losses brought forward | Previous period |
| Taxable profits | Calculated |
| Corporation tax at 25% | Calculated |
| Marginal relief | Calculated if applicable |
| CT payable | Final calculation |

**Approval Flow:**
1. User with `can_approve_filings` permission reviews
2. Clicks "Approve" → creates `filing_approvals` record
3. Status changes to `approved` or `ready_to_file`
4. User with `can_submit_filings` clicks "Submit"
5. Calls appropriate edge function (e.g., `hmrc-ct-submit`)
6. Creates `filing_submissions` record

**Status:** ✅ Working - Core flow operational

---

### 6.12 Payroll Module (`/payroll`)

**File:** `src/pages/Payroll.tsx`

**Purpose:** PAYE payroll management

**UI Elements (Tabs):**
1. **PAYE Schemes Tab** - Employer schemes
2. **Employees Tab** - Employee records
3. **Pay Runs Tab** - Monthly/weekly pay runs
4. **RTI History Tab** - Submission history

**PAYE Scheme Setup:**
| Field | Source | Column |
|-------|--------|--------|
| Employer name | `paye_schemes` | `employer_name` |
| PAYE ref | `paye_schemes` | `employer_ref` |
| Accounts office ref | `paye_schemes` | `accounts_office_ref` |
| Tax district | `paye_schemes` | `tax_district` |

**Employee Records:**
| Field | Source | Column |
|-------|--------|--------|
| Name | `employees` | `first_name`, `last_name` |
| NI number | `employees` | `ni_number` |
| Tax code | `employees` | `tax_code` |
| Salary | `employees` | `annual_salary` or `hourly_rate` |
| Start date | `employees` | `start_date` |
| Pension enrolled | `employees` | `pension_enrolled` |

**Pay Run Workflow:**
```
draft → processing → pending_rti → submitted → completed
```

**Pay Calculation Engine:**
**File:** `src/lib/payroll-calculation-engine.ts`

| Calculation | Logic |
|-------------|-------|
| Gross pay | Salary ÷ periods or hours × rate |
| Income tax | PAYE tables lookup |
| Employee NI | NI category and thresholds |
| Employer NI | NI category and thresholds |
| Pension (employee) | Percentage of qualifying earnings |
| Pension (employer) | Minimum 3% |
| Net pay | Gross - deductions |

**Status:** ✅ Working - Basic payroll functional

---

### 6.13 CIS Module (`/cis`)

**File:** `src/pages/CIS.tsx`

**Purpose:** Construction Industry Scheme returns

**UI Elements:**
- Contractors list
- Subcontractors list
- CIS Returns list
- Payment records

**Data Sources:**
| Table | Purpose |
|-------|---------|
| `cis_contractors` | Contractor registration |
| `cis_subcontractors` | Subcontractor verification |
| `cis_returns` | Monthly CIS returns |
| `cis_payments` | Payment records for deductions |

**CIS Return Flow:**
1. Record payments to subcontractors
2. Calculate deductions (20% or 30%)
3. Generate return for month
4. Submit to HMRC via edge function

**Status:** ✅ Working - Basic CIS functional

---

### 6.14 CRM Module (`/crm`)

**File:** `src/pages/CRM.tsx`

**Purpose:** Lead/prospect management

**UI Elements:**
- Lead pipeline board (Kanban-style)
- Lead list view
- "Add Lead" button
- Companies House lookup integration
- Lead conversion to client

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Lead name | `leads` | `first_name`, `last_name` or `company_name` |
| Lead type | `leads` | `lead_type` (same as client types) |
| Status | `leads` | `status` (new, contacted, qualified, proposal, won, lost) |
| Source | `leads` | `source` |
| Notes | `leads` | `notes` |
| Contact info | `leads` | `email`, `phone` |

**Companies House Lookup:**
- Enter company number or search by name
- Fetches company data from CH API
- Pre-fills lead form with company details

**Lead Conversion Flow:**
1. Lead marked as "won"
2. "Convert to Client" button appears
3. Opens conversion dialog
4. Creates client/company record
5. Optionally creates onboarding application
6. Archives lead

**Status:** ✅ Working

---

### 6.15 Quotes (`/quotes`)

**File:** `src/pages/Quotes.tsx`

**Purpose:** Service quotations/proposals

**UI Elements:**
- Quotes table with:
  - Quote number
  - Status badge
  - Total amount
  - Valid until date
  - Created date
  - View action
- "Create Quote" button

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Quote number | `quotes` | `quote_number` |
| Status | `quotes` | `status` |
| Total | `quotes` | `total_amount` |
| Valid until | `quotes` | `valid_until` |
| Lead/Client link | `quotes` | `lead_id`, `client_id`, `company_id` |
| Line items | `quote_lines` | Linked by `quote_id` |

**Quote Statuses:**
- `draft` - Being prepared
- `sent` - Sent to prospect
- `accepted` - Prospect accepted
- `rejected` - Prospect declined
- `expired` - Past valid_until date

**Status:** ✅ Working

---

### 6.16 Onboarding (`/onboarding`)

**File:** `src/pages/Onboarding.tsx`

**Purpose:** Client onboarding and AML compliance

**UI Elements:**
- Application cards showing:
  - Client name/company name
  - Application type (individual/company)
  - Status badge
  - AML status badge
  - Created date
- "Start Onboarding" button

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Application type | `onboarding_applications` | `application_type` |
| Name | `onboarding_applications` | `first_name`, `last_name`, `company_name` |
| Status | `onboarding_applications` | `status` |
| AML status | `onboarding_applications` | `aml_status` |
| Email | `onboarding_applications` | `email` |

**Onboarding Statuses:**
- `pending` - Not started
- `in_progress` - Client completing
- `aml_review` - Awaiting AML check
- `approved` - Ready to become client
- `rejected` - Application denied

**AML Statuses:**
- `pending` - Not checked
- `passed` - AML passed
- `failed` - AML failed
- `manual_review` - Requires manual review

**Status:** ✅ Working

---

### 6.17 Automations (`/automations`)

**File:** `src/pages/Automations.tsx`

**Purpose:** Workflow automation rule management

**UI Elements:**
- Automation rules table with:
  - Rule name
  - Trigger type
  - Action type
  - Last run time/status
  - Active toggle
  - Edit/Delete actions
- "New Rule" button
- "Templates" panel
- Filter controls (trigger, action, status)

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Rule name | `automation_rules` | `name` |
| Trigger type | `automation_rules` | `trigger_type` |
| Trigger config | `automation_rules` | `trigger_config` (JSONB) |
| Action type | `automation_rules` | `action_type` |
| Action config | `automation_rules` | `action_config` (JSONB) |
| Is active | `automation_rules` | `is_active` |
| Last execution | `automation_executions` | Latest by `automation_rule_id` |

**Trigger Types:**
| Trigger | Description |
|---------|-------------|
| `job_status_change` | When a job changes status |
| `deadline_approaching` | X days before deadline |
| `filing_status_change` | When filing status changes |
| `client_onboarded` | When client is created |
| `onboarding_approved` | When onboarding approved |

**Action Types:**
| Action | Description |
|--------|-------------|
| `create_job` | Creates a new job |
| `create_task` | Adds task to a job |
| `send_email` | Sends email from template |
| `send_notification` | In-app notification |

**Status:** ✅ Working

---

### 6.18 Deadlines (`/deadlines`)

**File:** `src/pages/Deadlines.tsx`

**Purpose:** Practice-wide deadline management

**UI Elements:**
- Quick filters (Overdue, This Week, This Month, High Risk)
- Left sidebar filters:
  - Search
  - Client
  - Deadline type
  - Filing body
  - Status
  - Risk level
  - Owner
  - Time horizon
- View toggle (List/Calendar)
- List view: DeadlinesTable
- Calendar view: DeadlinesCalendar
- "Create Deadline" button

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Due date | `deadlines` | `due_date` |
| Type | `deadlines` | `deadline_type` |
| Entity | `deadlines` | `client_id`, `company_id` |
| Status | `deadlines` | `status` (pending, completed, missed) |
| Risk level | `deadlines` | `risk_level` (low, medium, high, critical) |
| Owner | `deadlines` | `owner_id` |
| Filing body | `deadlines` | `filing_body` (HMRC, CH, internal) |

**Status:** ✅ Working

---

### 6.19 Templates (`/templates`)

**File:** `src/pages/Templates.tsx`

**Purpose:** Manage reusable templates

**UI Elements:**
- Template grid with:
  - Template name
  - Type icon
  - Status badge
  - Description
  - Last updated
- "New Template" dropdown:
  - Workpaper Template
  - Email Template
  - Job Template
  - Task Template
  - Checklist Template
  - Automation Template
  - Questionnaire Template
  - Records Request Template
- Search and filters

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Name | `templates` | `name` |
| Type | `templates` | `type` |
| Status | `templates` | `status` (active, draft, deprecated) |
| Description | `templates` | `description` |
| Service | `templates` | `service` (e.g., SA, CT600) |
| Content | `templates` | `content` (JSONB) |

**Status:** ✅ Working

---

### 6.20 Emails (`/emails`)

**File:** `src/pages/Emails.tsx`

**Purpose:** Email queue management

**UI Elements:**
- Stats cards (Drafts, Queued, Failed counts)
- Email queue table with:
  - Recipient
  - Subject
  - Client name
  - Context badge
  - Status badge
  - Date
  - Actions (Edit, Retry, Delete, Ignore)
- Tabs: All, Drafts, Queued, Failed
- "Compose" button
- "Process Queue" button
- "Retry All Failed" button

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Recipient | `email_queue` | `to_email`, `to_name` |
| Subject | `email_queue` | `subject` |
| Body | `email_queue` | `body_html`, `body_text` |
| Status | `email_queue` | `status` |
| Context | `email_queue` | `context` (invoice, chase, filing, etc.) |
| Error | `email_queue` | `error_message` |
| Client link | `email_queue` | `client_id` → `clients` |
| Company link | `email_queue` | `company_id` → `companies` |

**Email Statuses:**
- `draft` - Not ready to send
- `queued` - Ready for processing
- `pending` - Currently being sent
- `failed` - Send failed
- `sent` - Successfully sent
- `ignored` - Manually skipped

**Email Contexts:**
- `invoice` - Invoice emails
- `chase` - Payment reminders
- `onboarding` - Onboarding communications
- `filing` - Filing notifications
- `ad-hoc` - Manual emails
- `portal` - Portal invitations
- `system` - System notifications

**Status:** ⚠️ Partially Working - Email sending depends on mailbox connection

---

### 6.21 Workpapers (`/workpapers`)

**File:** `src/pages/Workpapers.tsx`

**Purpose:** Practice-wide workpaper view

**UI Elements:**
- Filters (Search, Type, Status)
- Workpapers table with:
  - Client/Company name
  - Type badge
  - Period
  - Status badge
  - Data source badge
  - Last updated
  - "View Job" action

**Data Sources:**
| Field | Table | Column |
|-------|-------|--------|
| Name | `workpaper_instances` | `name` |
| Service type | `workpaper_instances` | `service_type` |
| Status | `workpaper_instances` | `status` |
| Period | `workpaper_instances` | `period_start`, `period_end`, `period_label` |
| Data source | `workpaper_instances` | `data_source` |
| Field values | `workpaper_instances` | `field_values` (JSONB) |
| Client | `clients` (joined) | `first_name`, `last_name` |
| Company | `companies` (joined) | `company_name` |
| Job | `jobs` (joined) | `id`, `job_name` |

**Workpaper Types:**
- `SA` - Self Assessment
- `CT600` - Corporation Tax
- `ACCOUNTS` - Annual Accounts
- `VAT` - VAT Return
- `PAYROLL` - Payroll
- `CIS` - CIS

**Workpaper Statuses:**
- `draft` - Being prepared
- `in_progress` - Work ongoing
- `ready_for_review` - Awaiting review
- `finalised` - Locked and complete

**Status:** ✅ Working

---

### 6.22 Settings (`/settings`)

**File:** `src/pages/Settings.tsx`

**Purpose:** Practice settings and configuration

**Settings Sections:**

1. **Branding** (`/settings/branding`)
   - Logo upload (light/dark)
   - Trading name
   - Accent color
   - Preview of email, invoice, portal

2. **HMRC Integration** (`/settings/hmrc`)
   - MTD VAT connection status
   - OAuth flow for HMRC
   - Agent credentials

3. **Companies House** (`/settings/companies-house`)
   - API key configuration
   - Presenter ID/Auth code

4. **Email Templates** (`/settings/email-templates`)
   - Template management
   - Variable placeholders

5. **Job Templates** (`/settings/job-templates`)
   - Default job configurations
   - Task templates

6. **Permissions** (`/settings/permissions`)
   - Role assignments
   - Team member management

**Status:** ✅ Working

---

## 7. Data Flow Patterns

### 7.1 React Query Pattern

All data fetching uses TanStack React Query with centralized query keys.

**File:** `src/lib/queryKeys.ts`

```typescript
// Example query
const { data, isLoading } = useQuery({
  queryKey: ['clients', organization?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('organization_id', organization.id);
    if (error) throw error;
    return data;
  },
  enabled: !!organization?.id,
});
```

**Query Client Configuration:**
- `staleTime: 5 minutes` - Data considered fresh
- `gcTime: 30 minutes` - Cache retention
- `retry: 3` with exponential backoff

### 7.2 Real-time Subscriptions

**File:** `src/hooks/useRealtimeSubscription.ts`

```typescript
// Subscribe to table changes
useRealtimeSubscription({
  table: 'jobs',
  organizationId: organization?.id,
  queryKeys: [['jobs', organization?.id]],
});
```

Supabase Realtime provides:
- INSERT notifications
- UPDATE notifications
- DELETE notifications

### 7.3 Form Data Flow

Forms use React Hook Form with Zod validation:

```typescript
// Schema definition
const schema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email(),
});

// Form setup
const form = useForm<FormData>({
  resolver: zodResolver(schema),
});

// Submit handler
const onSubmit = async (data: FormData) => {
  const { error } = await supabase
    .from('table')
    .insert(data);
};
```

### 7.4 Multi-Tenancy Pattern

All queries scoped by `organization_id`:

```typescript
// Always include organization filter
.eq('organization_id', organization.id)
```

Row-Level Security (RLS) in database enforces this at DB level.

---

## 8. Key Business Logic Services

### 8.1 Filing Service

**File:** `src/lib/filing-service.ts`

Handles:
- Creating filings from workpapers
- Extracting tax breakdown from field values
- Calculating payment deadlines
- Managing filing status transitions

### 8.2 CT Computation Engine

**File:** `src/lib/ct-computation-engine.ts`

Calculates:
- Trading profits
- Total profits chargeable
- Corporation tax at applicable rates
- Marginal relief (for profits between £50k-£250k)
- Final CT payable

### 8.3 Payroll Calculation Engine

**File:** `src/lib/payroll-calculation-engine.ts`

Calculates:
- PAYE income tax using cumulative method
- Employee NI contributions
- Employer NI contributions
- Pension contributions
- Student loan deductions
- Net pay

### 8.4 Automation Engine

**File:** `src/lib/automation-engine.ts`

Processes:
- Trigger evaluation
- Action execution
- Rate limiting
- Execution logging

### 8.5 Posting Service

**File:** `src/lib/posting-service.ts`

Handles:
- Double-entry journal posting
- Invoice posting to ledger
- Bill posting to ledger
- Payment posting

---

## 9. Status Assessment: What's Working & What Isn't

### 9.1 Fully Working Features ✅

| Feature | Notes |
|---------|-------|
| Authentication | Login, logout, session management |
| User Management | Role assignment, team invites |
| Client CRUD | Create, read, update, delete clients |
| Company CRUD | Full company management |
| Companies House Sync | Fetch company data from CH |
| Jobs Management | Full workflow |
| Task Management | Create, assign, complete |
| Deadlines | Create, track, filter |
| Bookkeeping - COA | Chart of accounts setup |
| Bookkeeping - Invoices | Full invoice lifecycle |
| Bookkeeping - Bills | Full bill lifecycle |
| Bookkeeping - Journals | Manual journal entry |
| VAT Periods | Period creation and management |
| Workpapers | Create, edit, finalize |
| Filings | Basic filing workflow |
| Automations | Rule creation and execution |
| Templates | All template types |
| CRM/Leads | Lead management |
| Quotes | Quote creation and management |
| Onboarding | Application workflow |

### 9.2 Partially Working Features ⚠️

| Feature | Issue | Impact |
|---------|-------|--------|
| Email Sending | Requires mailbox OAuth connection | Cannot send without Gmail/Outlook connected |
| HMRC Submission | Requires HMRC OAuth credentials | Production submission needs agent credentials |
| Bank Sync | TrueLayer integration needed | Manual transaction entry works |
| Client Portal (External) | Portal access URL generation | Internal preview works |

### 9.3 Features Requiring Configuration 🔧

| Feature | Configuration Needed |
|---------|---------------------|
| HMRC MTD VAT | HMRC developer credentials + OAuth |
| Companies House Filing | Presenter ID, Authentication Code |
| Gmail Integration | Google Cloud OAuth credentials |
| Outlook Integration | Microsoft Azure OAuth credentials |
| Stripe Payments | Stripe API keys |
| TrueLayer Banking | TrueLayer API credentials |

### 9.4 Known Limitations

1. **Single Organization:** Users currently belong to one organization
2. **No Mobile App:** Web-only application
3. **UK-Only Tax:** Tax calculations are UK-specific
4. **No Document OCR:** Manual data entry for receipts/invoices
5. **Limited Reporting:** Basic reports only, no custom report builder

---

## 10. API & Edge Functions

### 10.1 Edge Functions Overview

**Location:** `supabase/functions/`

| Function | Purpose |
|----------|---------|
| `hmrc-auth` | Initiate HMRC OAuth flow |
| `hmrc-callback` | Handle HMRC OAuth callback |
| `hmrc-ct-submit` | Submit CT600 to HMRC |
| `hmrc-vat-submit` | Submit VAT return to HMRC |
| `companies-house-sync` | Fetch company data from CH |
| `ch-submit` | Submit to Companies House |
| `gmail-send` | Send email via Gmail |
| `outlook-send` | Send email via Outlook |
| `process-email-queue` | Process queued emails |
| `stripe-checkout` | Create Stripe checkout session |
| `stripe-webhook` | Handle Stripe webhooks |
| `generate-filing-pdf` | Generate filing PDF documents |
| `cis-submit` | Submit CIS return |
| `rti-submit` | Submit RTI to HMRC |
| `sla-check` | Check SLA compliance |
| `fx-rates` | Fetch foreign exchange rates |

### 10.2 API Authentication

Edge functions authenticate via:
1. Supabase JWT token (user context)
2. Service role key (server-side operations)

---

## 11. Third-Party Integrations

### 11.1 HMRC

**Purpose:** Tax filing submissions

**Integration Points:**
- MTD VAT API - VAT return submission
- CT600 API - Corporation tax (via XML)
- SA100 API - Self assessment
- RTI API - Payroll submissions
- CIS API - Construction industry scheme

**Auth Flow:** OAuth 2.0 with HMRC Government Gateway

### 11.2 Companies House

**Purpose:** Company data and filings

**Integration Points:**
- Company search and lookup
- Officer information
- PSC information
- Filing history
- WebFiling submission (CS01, accounts)

**Auth:** API key + WebFiling credentials

### 11.3 Gmail

**Purpose:** Email sending and sync

**Integration:** OAuth 2.0 via Google Cloud

### 11.4 Outlook

**Purpose:** Email sending and sync

**Integration:** OAuth 2.0 via Microsoft Azure

### 11.5 Stripe

**Purpose:** Subscription billing

**Integration:** Stripe API + webhooks

### 11.6 TrueLayer

**Purpose:** Open banking - bank feeds

**Integration:** OAuth 2.0 bank connection

---

## Appendix A: Environment Variables

Required environment variables:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Edge function secrets (Supabase dashboard)
HMRC_CLIENT_ID=xxx
HMRC_CLIENT_SECRET=xxx
COMPANIES_HOUSE_API_KEY=xxx
STRIPE_SECRET_KEY=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
TRUELAYER_CLIENT_ID=xxx
TRUELAYER_CLIENT_SECRET=xxx
```

---

## Appendix B: Database Migration Notes

Migrations located in `supabase/migrations/`

Key tables created via migrations:
- Core tables (organizations, clients, companies)
- Bookkeeping tables (accounts, invoices, bills)
- Filing tables (filings, submissions, approvals)
- Payroll tables (paye_schemes, employees, pay_runs)
- Automation tables (rules, events, executions)

RLS policies applied to all tables for multi-tenancy.

---

## Appendix C: Deployment

**Platform:** Lovable (automated CI/CD)

**Build Process:**
1. `npm run build` - Vite production build
2. Deploy to Lovable hosting
3. Supabase handles database and edge functions

**Production URLs:**
- Frontend: Configured via Lovable
- API: `https://xxx.supabase.co`
- Edge Functions: `https://xxx.supabase.co/functions/v1/`

---

*End of Documentation*

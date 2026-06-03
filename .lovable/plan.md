## Add a Jobs tab to the company detail page

### What's missing

`CompanyDetail.tsx` has tabs for Overview, Registers, **CoSec Jobs**, Payroll, Documents, Services, Settings — but nothing showing the *general* jobs (Year-End Accounts, Corporation Tax, VAT, Self Assessment, Payroll runs, etc.) for that company. CoSec Jobs is filtered to `service_type IN ('CS01','AP01','TM01','SH01',...)` so accounts/CT/VAT jobs simply don't appear anywhere on the company page.

### What already works (no change needed)

Jobs *are* generated automatically — `lifecycle_accept_quote` (migration `20260603105927_...`) inserts a `jobs` row plus matching `deadlines` row for every accepted service line (`company_accounts`, `corporation_tax`, `vat_return`, `payroll`, `confirmation_statement`, `sa_mtd`, `sa_non_mtd`), keyed to `company_id`/`client_id` with `period_start`, `period_end`, `period_label`, `filing_deadline`, `is_auto_generated = true`. They just have nowhere to be viewed from the client record.

### Plan

1. **New component `src/components/cosec/CompanyJobsTab.tsx`** (named for sibling folder consistency, despite being non-CoSec). Props: `companyId`, `organizationId`.
   - Query: `jobs` where `company_id = companyId`, ordered by `filing_deadline asc nulls last, created_at desc`.
   - Embed `deadlines(due_date, status)` to show next statutory due date.
   - Columns: Job Name · Service (formatted via `formatServiceType`) · Period (`period_label`) · Status badge · Filing Deadline (with the existing 30-day amber / 7-day red highlight rule from `mem://features/jobs-deadline-highlighting-logic`) · Assigned To.
   - Row click → `navigate('/jobs/' + job.id)` so users land on the existing job detail page (Workpapers, Tasks, Filing, etc.).
   - Header actions:
     - "View All in Jobs" → `/jobs?company=<companyId>` (re-uses central Jobs page).
     - "New Job" → opens existing `CreateJobDialog` with `companyId` pre-selected.
   - Empty state: explains that jobs are generated automatically when a quote is accepted, with a link to the Quotes tab / "New Job" button as fallback.
   - Loading skeleton + error state matching `CompanyCoSecJobsTab` patterns.

2. **`CompanyDetail.tsx` tab additions**
   - Insert a new `<TabsTrigger value="jobs">` between Registers and CoSec Jobs, icon `Briefcase`.
   - Add matching `<TabsContent value="jobs">` rendering `<CompanyJobsTab companyId={companyId} organizationId={organization.id} />`.
   - Keep "CoSec Jobs" tab unchanged (it's the specialist workpaper view).

3. **Central Jobs page filter passthrough** (`src/pages/Jobs.tsx`)
   - Read `?company=` from the URL on mount; if present, scope the query to that company and surface a dismissible chip "Filtered: {company name}" so "View All in Jobs" lands on a pre-filtered list.

4. **Verification**
   - Open Bassage Eyes Ltd: confirm new Jobs tab lists every auto-generated job from quote acceptance (Year-End Accounts, CT, VAT, Confirmation Statement, etc., per the services on their engagement).
   - Confirm filing deadline column highlights amber/red per the threshold rule.
   - Click a row → lands on `/jobs/<id>` job workspace.
   - Click "View All in Jobs" → `/jobs?company=<id>` shows only that company's jobs.
   - Confirm CoSec Jobs tab still works and only shows CS01/AP01/TM01/SH01.

### Out of scope

- No DB schema changes (auto-generation already exists).
- No changes to the deadlines engine itself.
- No edits to the `Jobs` page beyond reading the `company` query param.

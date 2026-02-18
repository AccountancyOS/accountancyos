

# Chaser Policies v2: Full Revised Plan

## Key Changes from v1

1. **Auto-job creation on trigger** -- chasers start even if no job exists yet. A `trigger-scan` edge function finds entities whose period triggers have passed and calls `ensureJobExistsForPeriod` before starting chasers.
2. **`service_code` as primary discriminator** -- uses `services_catalog.code` (e.g. `CT600`, `SA-RETURN`, `VAT-RETURN`) rather than inventing a new `job_template_key`. Policies are keyed by `(organization_id, service_code)`.
3. **Idempotent job-per-period creation** -- unique constraint on `(organization_id, service_code, entity_id, period_end)` in a new `chaser_job_periods` tracking table.
4. **Idempotency based on scheduled slot** -- `idempotency_key` uses the run's `next_send_at` ISO timestamp (full precision, no rounding) captured before advancing.
5. **Legacy workflow deprecation** -- records-chaser workflow templates are marked deprecated and their instances stopped via migration. They cannot be created/edited/enabled in the UI.
6. **Two separate scheduled functions** -- `chaser-trigger-scan` (finds triggers, ensures jobs, starts runs) and `chaser-tick` (sends due reminders). Both use service role with explicit org scoping.

---

## Phase 1: Database Schema

### Table A: `automation_chaser_policies`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| organization_id | uuid FK organizations | RLS scoped |
| service_code | text NOT NULL | Matches `services_catalog.code` (e.g. `CT600`, `SA-RETURN`) |
| name | text NOT NULL | Display name |
| description | text | |
| trigger_type | text NOT NULL | `COMPANY_YEAR_END`, `TAX_YEAR_END`, `MTD_QUARTER_END`, `VAT_PERIOD_END`, `MANUAL`, `JOB_CREATED` |
| trigger_offset_days | int default 0 | Start X days after trigger date |
| frequency_unit | text default 'MONTH' | `DAY`, `WEEK`, `MONTH` |
| frequency_interval | int default 1 | e.g. 2 for fortnightly |
| min_frequency_interval | int default 1 | Guardrail |
| max_frequency_interval | int default 12 | Guardrail |
| email_template_id | uuid nullable FK templates | Required when enabled |
| stop_condition_type | text default 'JOB_STATUS_EQUALS' | |
| stop_condition_value | text default 'records_received' | |
| is_enabled | bool default false | |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

**Unique constraint**: `(organization_id, service_code)` -- one chaser policy per service per org.

### Table B: `automation_chaser_runs`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | |
| job_id | uuid FK jobs | |
| policy_id | uuid FK automation_chaser_policies | |
| status | text default 'ACTIVE' | `ACTIVE`, `STOPPED`, `PAUSED` |
| trigger_date | timestamptz NOT NULL | The resolved trigger date |
| period_start | date nullable | For audit/correctness |
| period_end | date nullable | For audit/correctness |
| next_send_at | timestamptz | When next reminder fires |
| frequency_unit | text | Copied from policy |
| frequency_interval | int | Copied from policy |
| email_template_id | uuid nullable | Copied from policy; overridable |
| stop_condition_value | text | Copied from policy |
| last_sent_at | timestamptz nullable | |
| send_count | int default 0 | |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

**Unique constraint**: `(job_id, policy_id)` -- one run per job per policy.

### Table C: `automation_chaser_messages`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | |
| job_id | uuid FK | |
| chaser_run_id | uuid FK | |
| to_email | text | |
| template_id | uuid nullable | |
| rendered_subject | text | |
| rendered_body | text | |
| status | text default 'QUEUED' | `QUEUED`, `SENT`, `FAILED`, `CANCELLED` |
| send_at | timestamptz | |
| sent_at | timestamptz nullable | |
| failure_reason | text nullable | |
| idempotency_key | text UNIQUE | `{org_id}:{run_id}:{next_send_at_iso}` -- full ISO, no rounding |
| created_at | timestamptz default now() | |

### Table D: `chaser_job_periods` (idempotent job creation tracking)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | |
| service_code | text | |
| entity_type | text | 'company' or 'client' |
| entity_id | uuid | company_id or client_id |
| period_end | date | |
| job_id | uuid FK jobs | The created/found job |
| created_at | timestamptz default now() | |

**Unique constraint**: `(organization_id, service_code, entity_id, period_end)` -- prevents duplicate job creation per entity per period.

### RLS Policies (all 4 tables)

Standard org-scoped pattern:
- SELECT: `organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())`
- INSERT/UPDATE/DELETE: same filter plus role check for manager+ via existing `has_role` or `can_manage_automation_rules` function

### Indexes

- `automation_chaser_runs(status, next_send_at)` -- scheduler hot path
- `automation_chaser_runs(job_id)` -- stop-condition lookups
- `automation_chaser_messages(chaser_run_id, status)` -- cancellation queries
- `chaser_job_periods(organization_id, service_code, entity_id, period_end)` -- unique constraint covers this

### Migration: Deprecate legacy chaser workflows

```sql
-- Mark records-chaser workflow templates as deprecated
UPDATE automation_workflow_templates
SET default_enabled = false
WHERE key IN (
  'LTD_ACCOUNTS_CT_ANNUAL', 'SA_NON_MTD_ANNUAL', 'SA_MTD_QUARTERLY',
  'SA_MTD_ANNUAL_EOPS', 'VAT_QUARTERLY'
);

-- Stop active workflow instances for these templates
UPDATE automation_workflow_instances
SET status = 'stopped'
WHERE workflow_template_id IN (
  SELECT id FROM automation_workflow_templates
  WHERE key IN ('LTD_ACCOUNTS_CT_ANNUAL', 'SA_NON_MTD_ANNUAL', 'SA_MTD_QUARTERLY', 'SA_MTD_ANNUAL_EOPS', 'VAT_QUARTERLY')
)
AND status IN ('active', 'waiting');
```

---

## Phase 2: Domain Service (`src/lib/chaser-policy-service.ts`)

### Core Functions

**`resolveTriggerDate(triggerType, job, company)`**:
- `COMPANY_YEAR_END`: Uses `companies.year_end_month` + `year_end_day`. Computes the most recent accounting period end <= today by constructing `YYYY-MM-DD` from year_end fields and walking back if needed. Falls back to `jobs.period_end` if year_end fields are null.
- `TAX_YEAR_END`: If today >= April 6 of current year, trigger = April 5 of current year. Otherwise April 5 of previous year. Constrained by job's tax year context from `period_end`.
- `MTD_QUARTER_END`: Uses `jobs.period_end` directly (the quarter end date). Standard quarters: Q1=Apr 5, Q2=Jul 5, Q3=Oct 5, Q4=Jan 5. If no bespoke schedule stored, uses these defaults.
- `VAT_PERIOD_END`: Uses `jobs.period_end`. Derives from `companies.vat_frequency` + `vat_stagger_group` if no job exists yet.
- `JOB_CREATED`: `jobs.created_at`
- `MANUAL`: Returns null (set manually by accountant)

Returns `{ triggerDate: Date | null, error?: string }`. If data is missing, returns error string for UI display.

**`ensureJobExistsForPeriod(orgId, entityType, entityId, serviceCode, periodStart, periodEnd)`**:
1. Check `chaser_job_periods` for existing record (unique constraint)
2. If exists, return the `job_id`
3. If not, find the org's `job_templates` matching `service_type` mapped from `service_code`
4. Call `generateJobFromTemplate()` (existing idempotent function)
5. Insert into `chaser_job_periods` with ON CONFLICT DO NOTHING
6. Return job_id

**Service code to service_type mapping**:
```
CT600 -> corporation_tax
SA-RETURN -> self_assessment
VAT-RETURN -> vat
CONFIRM-STMT -> confirmation_statement
PAYROLL -> payroll
BK-MONTHLY / BK-ANNUAL -> bookkeeping
```

**`computeNextSendAt(fromDate, frequencyUnit, frequencyInterval)`**: Adds interval using date-fns.

**`startChaserRun(jobId, policyId, triggerDate, periodStart, periodEnd)`**: Creates run with computed first `next_send_at = triggerDate + offset_days`.

**`stopChaserRunsForJob(jobId)`**: Sets all ACTIVE runs to STOPPED, cancels QUEUED messages.

**`renderChaserEmail(templateId, job, client, company)`**: Loads template from `templates` table, resolves placeholders using existing `placeholder-resolver.ts`.

---

## Phase 3: Trigger Scanner (`supabase/functions/chaser-trigger-scan/index.ts`)

A new edge function that runs on a cron schedule (every 6 hours) to detect triggers that have fired.

### Logic

1. Fetch all enabled `automation_chaser_policies` across all orgs (service role, batched by org)
2. For each policy:
   a. Fetch entities (companies or clients) with active engagements matching the `service_code`
   b. For each entity, compute the current period's `period_end` based on trigger_type:
      - `COMPANY_YEAR_END`: compute from `year_end_month`/`year_end_day`
      - `TAX_YEAR_END`: April 5 of relevant year
      - `MTD_QUARTER_END`: most recent standard quarter end <= today
      - `VAT_PERIOD_END`: compute from `vat_frequency` + `vat_stagger_group`
   c. Check if `period_end + trigger_offset_days <= today`
   d. If yes, call `ensureJobExistsForPeriod` (idempotent)
   e. Then ensure a chaser run exists for this job+policy (idempotent via unique constraint)
3. Uses LIMIT-based batching (100 entities per batch) to handle large orgs

### Safety

- `verify_jwt = false` in config.toml (cron-invoked)
- Uses service role key only -- no user context
- All DB operations explicitly scoped by `organization_id`
- No elevated privileges exposed -- function is not callable with meaningful side effects without service role

---

## Phase 4: Reminder Sender (`supabase/functions/chaser-tick/index.ts`)

Runs every 15 minutes via cron.

### Logic

1. Query `automation_chaser_runs WHERE status = 'ACTIVE' AND next_send_at <= now()` with LIMIT 100
2. For each run:
   a. Fetch job status. If matches `stop_condition_value` -> set run STOPPED, cancel QUEUED messages, continue
   b. Compute `idempotency_key = {org_id}:{run_id}:{next_send_at_iso}` (captured BEFORE updating next_send_at)
   c. INSERT INTO `automation_chaser_messages` with ON CONFLICT (idempotency_key) DO NOTHING
   d. If insert succeeded (not a conflict):
      - Resolve recipient email from job's client primary contact
      - Render template via placeholder resolver
      - INSERT INTO `email_queue` for actual sending
      - Update message status to SENT or FAILED
   e. Update run: `last_sent_at = now()`, `send_count++`, compute `next_send_at = last_sent_at + frequency`

### Security

- `verify_jwt = false` (cron-invoked)
- Service role only, explicit org scoping on every query
- Idempotency key prevents double-sends even under retries

---

## Phase 5: Job Status Change Hook

Modify `src/lib/job-status-service.ts`:
- After successful status update, if `newStatus === 'records_received'`:
  - Call `stopChaserRunsForJob(jobId)` which:
    - Updates all ACTIVE runs for that job to STOPPED
    - Cancels all QUEUED messages for those runs

This is immediate -- does not wait for the next scheduler tick.

---

## Phase 6: UI Changes

### A. Replace Workflow Library tab with Chaser Policies tab

**New file: `src/components/automations/ChaserPoliciesTab.tsx`**

Displays cards grouped by service code:
- Each card: policy name, trigger description (read-only text), frequency selector (unit + interval dropdowns within guardrails), email template dropdown (from `templates WHERE type='email'`), stop condition (read-only "Stops when Records Received"), enabled toggle
- No steps, no accordion, no WAIT_UNTIL/CONDITION
- If `email_template_id` is null when toggling on, show validation error "Select an email template first"
- Warning banner if trigger data is missing (e.g. no year_end_month on company)

### B. Update `Automations.tsx`

- Rename "Workflow Library" tab to "Chaser Policies", render `ChaserPoliciesTab`
- Rename "Monitor" tab to "Chaser Monitor", render new `ChaserRunsMonitor.tsx`
- Keep "Custom Rules" tab unchanged
- Remove imports of `WorkflowLibraryTab` and `WorkflowInstancesMonitor` from tab rendering (files kept but not rendered)

### C. New `ChaserRunsMonitor.tsx`

Shows active/stopped/paused chaser runs with:
- Job name, client/company, service, status, next send date, send count, last sent
- Filter by status, service code

### D. Job Detail: `JobChasersPanel.tsx`

On job detail page:
- Active/stopped status per policy
- Next send date
- Pause/Resume button (toggles status ACTIVE <-> PAUSED)
- "Start Chaser" button for MANUAL trigger policies
- Timeline of sent messages from `automation_chaser_messages`

---

## Phase 7: Default Policy Seeding

Insert default policies per organization. Seeded via migration for existing orgs and via application code on new org creation.

| Service Code | Trigger Type | Default Frequency | Stop Condition |
|---|---|---|---|
| CT600 | COMPANY_YEAR_END | Monthly (MONTH/1) | records_received |
| SA-RETURN | TAX_YEAR_END | Monthly (MONTH/1) | records_received |
| SA-MTD-QUARTERLY* | MTD_QUARTER_END | Monthly (MONTH/1) | records_received |
| SA-MTD-ANNUAL* | TAX_YEAR_END | Monthly (MONTH/1) | records_received |
| VAT-RETURN | VAT_PERIOD_END | Weekly (WEEK/1) | records_received |
| CGT* | MANUAL | Fortnightly (WEEK/2) | records_received |
| PAYROLL | JOB_CREATED | Monthly (MONTH/1) | records_received |
| BK-MONTHLY | JOB_CREATED | Monthly (MONTH/1) | records_received |
| BK-ANNUAL | JOB_CREATED | Monthly (MONTH/1) | records_received |
| CONFIRM-STMT | COMPANY_YEAR_END | Monthly (MONTH/1) | records_received |
| ANNUAL-ACC | COMPANY_YEAR_END | Monthly (MONTH/1) | records_received |

*Service codes `SA-MTD-QUARTERLY`, `SA-MTD-ANNUAL`, and `CGT` do not yet exist in `services_catalog`. The migration will INSERT them.

All policies are seeded with `is_enabled = false` -- the accountant must choose a template and enable.

---

## Phase 8: Legacy Workflow Deprecation

### What changes
- The 5 records-chaser workflow templates (`LTD_ACCOUNTS_CT_ANNUAL`, `SA_NON_MTD_ANNUAL`, `SA_MTD_QUARTERLY`, `SA_MTD_ANNUAL_EOPS`, `VAT_QUARTERLY`) are set to `default_enabled = false` via migration
- Their active instances are stopped
- `WorkflowLibraryTab.tsx` and `WorkflowInstancesMonitor.tsx` files are kept but NOT rendered in any tab
- The "Chaser Policies" tab fully replaces chaser functionality
- Non-chaser workflows (e.g. `CRM_PROPOSAL_CHASER`, `ONBOARDING_NEW_CLIENT`) remain functional via the internal engine but are not shown in the primary UI (they can be managed via Custom Rules)

### What does NOT change
- `workflow-tick` edge function stays deployed (processes non-chaser workflow instances)
- `automation_workflow_*` tables stay intact
- `workflow-step-executor.ts`, `workflow-trigger-router.ts` stay intact

---

## Files Summary

### New Files
- `src/lib/chaser-policy-service.ts` -- domain logic (trigger resolution, job creation, run management)
- `src/components/automations/ChaserPoliciesTab.tsx` -- policy management UI
- `src/components/automations/ChaserRunsMonitor.tsx` -- run monitoring UI
- `src/components/jobs/JobChasersPanel.tsx` -- job detail chaser section
- `supabase/functions/chaser-trigger-scan/index.ts` -- trigger scanner edge function
- `supabase/functions/chaser-tick/index.ts` -- reminder sender edge function

### Modified Files
- `src/pages/Automations.tsx` -- swap tabs
- `src/lib/job-status-service.ts` -- add stop-chaser hook
- `supabase/config.toml` -- add `[functions.chaser-trigger-scan]` and `[functions.chaser-tick]`

### Database Migration
- CREATE 4 tables with RLS, unique constraints, indexes
- INSERT new service codes (`SA-MTD-QUARTERLY`, `SA-MTD-ANNUAL`, `CGT`) into `services_catalog` for existing orgs
- INSERT default chaser policies for all existing organizations
- Deprecate/stop legacy chaser workflow templates and instances
- `pg_cron` schedules for both edge functions

### Not Changed / Not Deleted
- `WorkflowLibraryTab.tsx` -- kept, not rendered
- `WorkflowInstancesMonitor.tsx` -- kept, not rendered
- `workflow-tick` edge function -- kept for non-chaser workflows
- All `automation_workflow_*` tables -- kept

---

## Acceptance Criteria

1. For each service type, an accountant enables a chaser in under 1 minute: pick template, set frequency, toggle on
2. When a company's year end passes (or tax year end, or VAT period end), the trigger scanner automatically creates the job and starts the chaser -- even if no job existed
3. Reminders queue and send on the configured frequency
4. Reminders stop immediately when job status becomes `records_received`
5. `idempotency_key` based on `next_send_at` ISO timestamp prevents duplicates under retries
6. No workflow-step UI visible for chaser functionality
7. Legacy chaser workflow instances are stopped; templates marked as deprecated

## Regression Checks

1. `records_received` status change -> all active chasers for that job stop, QUEUED messages cancelled
2. Frequency change -> only affects future `next_send_at`, past messages untouched
3. Missing trigger data (no `year_end_month` on company) -> chaser start blocked with clear error message
4. Large org (1000+ entities) -> trigger scanner uses batched queries with LIMIT, no timeouts
5. RLS blocks cross-org access on all 4 new tables
6. Email templates render correctly with client/job merge fields via existing placeholder resolver
7. Rerunning trigger scanner is idempotent (unique constraint on `chaser_job_periods`)
8. Rerunning chaser-tick is idempotent (unique `idempotency_key` on messages)


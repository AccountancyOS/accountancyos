## Problem

`ClientJobsTab` (used in the client workspace under `/clients/:id` → Jobs tab) is a stub showing "Jobs list coming soon". Meanwhile the global Jobs page and `CompanyJobsTab` both query the real `jobs` table. Result: the left-menu Jobs view shows everything, but the per-client tab shows nothing — they're out of sync because the per-client tab was never implemented.

Verified in DB: jobs for this org exist, linked via either `jobs.client_id` (individual clients, e.g. the SA job for Bassage Eyes individual) or `jobs.company_id` (company entities).

## Change

Replace `src/components/client-portal/ClientJobsTab.tsx` with a real implementation that mirrors `CompanyJobsTab.tsx`, but filtered by `client_id` instead of `company_id`.

Behavior:
- Query: `jobs` where `client_id = clientId` and `organization_id = currentOrg`, ordered by `filing_deadline asc nulls last`, then `created_at desc`.
- Render the same columns as `CompanyJobsTab` (Job Name, Service, Period, Status, Filing Deadline, Source) with the same deadline highlighting (30/7-day amber/red rules per `getDeadlineThresholdDays`) and status badges.
- Row click → `/jobs/:id`.
- "View All In Jobs" button → `/jobs?client=:clientId`.
- "New Job" button opens `CreateJobDialog` (same as company tab).
- Loading skeleton + error retry + empty state, matching `CompanyJobsTab`.

## Out of scope

- No schema changes; no migration.
- Not surfacing company-linked jobs on a client workspace (the two entity types stay scoped to their own ids, consistent with the `company_id` XOR `client_id` model).
- No changes to the global Jobs page or sidebar.

## Files

- `src/components/client-portal/ClientJobsTab.tsx` — replace stub with full implementation.

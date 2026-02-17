

# Plan: Replace Job Progress Bar with Workflow Status Dropdown

## Problem

The current job detail page shows a percentage-based progress bar that has no way for accountants to update it. Progress is only set to 100% when the job is marked complete. This provides no meaningful workflow visibility.

## Solution

Replace the progress bar with a **job workflow status** dropdown that reflects the real stages of an accountant's engagement lifecycle. The existing `status` field on the `jobs` table will be expanded with the new workflow values.

### New Job Workflow Statuses

| Status Value | Display Label | Description |
|---|---|---|
| `blank` | -- (empty/dash) | Upcoming job, no action yet |
| `records_requested` | Records Requested | Automation has triggered a records request |
| `records_received` | Records Received | Accountant confirms records arrived |
| `accountant_queries` | Accountant Queries | Accountant has raised queries |
| `client_queries` | Client Queries | Client has raised queries |
| `accountant_review` | Accountant Review | Work is being reviewed internally |
| `client_review` | Client Review | Sent to client for review/approval |
| `ready_to_file` | Ready to File | Approved and ready for submission |
| `completed` | Completed | Job done; triggers next-year rollover |

These replace the existing statuses (`not_started`, `in_progress`, `waiting_on_client`, `ready_for_review`, `in_review`, `on_hold`, `cancelled`).

### Technical Changes

**1. Update `src/lib/job-status-service.ts`**
- Replace the `JobStatus` type with the new workflow values
- Update `validStatuses` array
- Update status transition validation (the new statuses are a linear progression but allow jumping back)
- Keep `completed` as the terminal status that triggers automation events

**2. Update `src/lib/format-utils.ts`**
- Update `JOB_STATUS_LABELS` map with the new status values and display labels
- `blank` maps to "---" (em dash) to show as visually empty

**3. Update `src/pages/JobDetail.tsx`**
- Remove the progress bar from the status bar section (lines 406-417)
- Replace with an inline `Select` dropdown showing the current workflow status
- Changing the dropdown fires `updateJobStatus()` from the job-status-service
- Keep "Mark Complete" button which sets status to `completed`

**4. Update `src/pages/Jobs.tsx`**
- Update any status filter options to use the new workflow values
- Update the Jobs table status column to show the new labels

**5. Update `src/components/jobs/JobsQuickFilters.tsx`**
- Update quick filter options to match new statuses (e.g., "Records Requested", "Client Queries")

**6. Database migration**
- Update existing `jobs.status` values: map `not_started` to `blank`, `in_progress` to `records_received`, `waiting_on_client` to `client_queries`, `ready_for_review` to `accountant_review`
- Update `jobs.progress` column default (keep column for backward compat but it becomes unused)

**7. Update `src/components/jobs/JobTasksTab.tsx`**
- Remove the done/todo checkbox toggle and the `status` display on tasks
- Tasks remain as a simple checklist (title, description, due date, conversation) but without workflow status of their own

**8. Update related components**
- `JobPipelineOverview.tsx` - update status icon mapping for new values
- `CompanyCoSecJobsTab.tsx` - update status badges
- `JobPipelineChart.tsx` (dashboard) - update grouping keys
- `JobConversationTab.tsx` - if it auto-sets status on messages, update to new values

### Completion Behaviour

When the accountant clicks "Mark Complete" (which sets status to `completed`):
- The existing `completeJob()` flow runs (automation triggers, audit log)
- Auto-rollover creates the next-year job (existing behaviour via filing flow)
- The new job starts with status `blank`

### What Stays the Same

- Tasks tab remains for checklist items within a job (title, description, due date, conversation thread)
- Job conversations, documents, timeline, settings tabs are unchanged
- The `priority` and `filing_deadline` fields remain as-is in the status bar
- Auto-rollover and automation trigger logic is unchanged (just triggered by different status values)

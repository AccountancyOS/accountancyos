

# Plan: Fix Lowercase Status and Priority Labels Across the UI

## Problem

Status badges ("in progress", "not started", "waiting on client") and priority badges ("high", "normal", "low") display raw database values in lowercase throughout the application. These should be properly title-cased for a professional, client-ready appearance.

## Solution

Add two new formatter functions to the centralized `format-utils.ts` and replace all raw `.replace(/_/g, " ")` and direct `{job.priority}` usages across the codebase.

### New Functions in `src/lib/format-utils.ts`

**`formatJobStatus(status)`** -- maps raw status values to display labels:

| Raw Value | Display Label |
|-----------|--------------|
| `not_started` | Not Started |
| `in_progress` | In Progress |
| `waiting_on_client` | Waiting on Client |
| `ready_for_review` | Ready for Review |
| `in_review` | In Review |
| `with_reviewer` | With Reviewer |
| `completed` | Completed |
| `on_hold` | On Hold |
| `cancelled` | Cancelled |
| `filed` | Filed |
| `draft` | Draft |
| (fallback) | Title-cased with underscores replaced |

**`formatPriority(priority)`** -- maps raw priority values to display labels:

| Raw Value | Display Label |
|-----------|--------------|
| `low` | Low |
| `normal` | Normal |
| `medium` | Medium |
| `high` | High |
| `critical` | Critical |
| `urgent` | Urgent |
| (fallback) | Title-cased |

### Files to Update

All instances of `.status.replace(/_/g, " ")` and raw `{job.priority}` will be replaced with the new formatters:

| File | Change |
|------|--------|
| `src/lib/format-utils.ts` | Add `formatJobStatus` and `formatPriority` functions |
| `src/pages/Jobs.tsx` | Replace `job.status.replace(/_/g, " ")` and `{job.priority}` |
| `src/pages/JobDetail.tsx` | Replace `job.status.replace(/_/g, " ")` and `{job.priority}` |
| `src/pages/FilingDetail.tsx` | Replace `status.replace(/_/g, " ")` |
| `src/pages/Workpapers.tsx` | Replace `wp.status.replace(/_/g, " ")` |
| `src/components/jobs/JobFilingTab.tsx` | Replace `filing.status.replace(/_/g, " ")` |
| `src/components/cosec/CompanyCoSecJobsTab.tsx` | Replace all `.replace(/_/g, " ")` instances |
| `src/components/cosec/CS01WorkpaperTab.tsx` | Replace `.replace(/_/g, " ")` instances |
| `src/components/client-portal/ClientWorkpapersTab.tsx` | Replace `wp.status.replace(/_/g, " ")` |

Files already using proper title-casing (like `BillsTab.tsx` and `SalesTab.tsx` which have their own `getStatusLabel`) will be left as-is.

## Risk

Low -- purely display-level text formatting changes. No logic, data, or layout changes.


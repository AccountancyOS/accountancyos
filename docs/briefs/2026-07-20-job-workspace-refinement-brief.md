# Job Workspace Refinement — Brief

> Source: owner brief, 2026-07-20. Captured verbatim as the input to a
> brainstorming → spec → plan cycle. NOT yet a finalised spec.

## Summary

Refactor the job detail screen into a focused "job workspace". Do NOT redesign the
underlying job architecture or create parallel data models. Reuse existing job,
workflow, request, document, task, conversation, workpaper and timeline data.

## Objective — an accountant opening a job must immediately answer:

1. What job is this?
2. Who is it for?
3. What period does it cover?
4. What stage is it at?
5. What is blocking progress?
6. What documents received/requested?
7. What work is completed?
8. What remains?
9. What happened recently?
10. What action next?

Concise overview first; detailed working areas behind clear tabs.

## Required information architecture

Top-level structure: (1) Job header, (2) Workflow progress + job health,
(3) Primary workspace tabs, (4) Contextual actions.

Main tabs: Overview · Documents · Workpaper · Tasks · Conversation · Timeline · Settings.

- Merge Records into Documents.
- Merge Questionnaire into Documents or Overview (per how questionnaires are represented).
- No separate generic Pipeline tab if Overview shows job progress.
- Keep Filing tab ONLY where the job type has a genuine filing/submission workflow;
  otherwise surface filing status within Overview or Workpaper.
- No empty/irrelevant tabs. Navigation is capability-driven, not every-module-for-every-job.

## 1. Job header (denser, operational — replace oversized heading)

Left: job title; client name (clickable); client type; tax year/accounting/filing period;
job reference (where present); assigned owner; due date; filing deadline (where applicable).
Replace internal codes (e.g. "Sa Non Mtd") with proper display names.

Example:
> Self-Assessment Tax Return — 2025/26
> Testing Ltd · Individual client · Assigned to Leon Stevens
> Due 15 January 2027 · Filing deadline 31 January 2027

Right: compact action group. Primary = Advance job / Complete current stage (STATE-AWARE,
not permanent "Mark Complete"). Secondary = Email client, Open client portal, Add task,
Request documents, More menu. Primary action derives from current workflow state:
Send information request → Mark records received → Start workpaper → Submit for review →
Approve workpaper → Send for client approval → File return → Mark complete.

## 2. Workflow progress + job health (replace the two useless "Status"/"Workflow" concepts)

Workflow stage: prominent human-readable badge + horizontal stepper
(Records requested → Records received → Preparation → Review → Client approval → Filing → Complete).
Stepper shows completed / current / future / blocked stages. Workflow comes from the job's
CONFIGURED workflow definition — do not hardcode one sequence for all job types.

Job health (compact horizontal/grid, not big cards): due date; days remaining/overdue;
owner; open tasks; outstanding client requests; unread client messages; last activity;
filing status (where applicable).

Blockers: clear banner below the workflow, generated from ACTUAL outstanding
requirements/tasks/approvals/validation errors — no generic placeholders.

## 3. Overview tab (default landing; summarise, don't duplicate)

Responsive two-column. Main column:
- A. Next action (single most important; calculated from stage + outstanding items; with button).
- B. Workflow progress (stepper here if not retained above tabs — never twice).
- C. Recent documents & requests (latest uploads + outstanding requests + missing required
  records + questionnaire completion; max 5 items; link to View all documents).
- D. Workpaper summary (status, % complete, sections completed, review status, reviewer,
  key validation issues, last edited by/when; "Open workpaper" button).
- E. Tasks summary (overdue, due today, open, recently completed — short urgent list).
- F. Recent conversation (latest client/internal messages + unread state; not full thread).
- G. Recent activity (latest 5 timeline events; link to full timeline).

Side column (narrower contextual sidebar):
- Job details: type, period, due date, filing deadline, owner, reviewer, workflow, created.
- Client details: name, type, primary contact, email, phone, portal status.
- Related work (where relevant): previous/next-period job, linked bookkeeping period,
  linked accounts job, linked tax return, related filing.
- Do NOT render fields with no value; avoid large empty cards.

## 4. Documents tab (single home for all files/records/requests; merge Records+Documents)

A. Document requests — title, description, requested date/by, due date, status, linked
   document, client response, reminder history. Statuses: Draft/Sent/Viewed/Partially
   received/Received/Accepted/Rejected/No longer required. Actions: Add request, Send
   reminder, Mark received, Link uploaded document, Edit, Cancel.
B. Uploaded documents (client/accountant/integration/email ingestion/external) — file name,
   category, source, uploaded by/date, related request, review status, version, notes.
   Filters: All/Client uploads/Accountant uploads/Outstanding review/Linked to request/
   Uncategorised. Actions: Upload, Preview, Download, Rename, Categorise, Link to request,
   Add note, Replace version, Archive. Useful empty state with CTAs (Request documents / Upload document).
C. Required records checklist (where template defines) — each item: Not requested/Requested/
   Received/Reviewed/Not applicable. Drives job readiness + workflow blockers.

## 5. Workpaper tab (open the ACTUAL workpaper, not a status card)

No workpaper → show applicable template, explain what will be created, "Create workpaper".
Exists → load workpaper in job context: section nav, completion status, validation errors,
preparer/reviewer, sign-off status, source documents linked per section, notes/review points,
persist draft changes, record audit events.
Workpaper header: name, status, % complete, prepared by, reviewed by, last saved, validation count.
Status-dependent actions: Save draft, Mark section complete, Submit for review, Raise review
point, Return to preparer, Approve, Reopen (NOT one generic "Mark Complete").
Review points visible/actionable: section, raised by/date, assigned to, priority, status,
comment thread, resolution. Open points block approval where required.

## 6. Tasks tab (all tasks for THIS job)

Fields: title, status, assignee, due date, priority, task type, source, related workflow
stage, related document/workpaper section. Views: Open/My tasks/Overdue/Completed/All.
Actions: Add, Assign, Change due date, Change priority, Complete, Reopen, Link to document,
Link to workpaper section. Workflow-generated tasks distinguishable from manual. Don't
duplicate document requests as tasks (keep linked but distinct).

## 7. Conversation tab (one consolidated job-specific thread)

Includes: portal messages, emails linked to job, internal notes, automated request messages,
reminders, client replies. Filters: All/Client-facing/Internal/Email/Portal/Automated.
Clearly distinguish client-visible vs internal-only. Composer: Send message, Send email,
Add internal note, Attach document, Use template. Delivery status: Draft/Queued/Sent/
Delivered/Opened/Failed. Do NOT mix audit events into the conversation.

## 8. Timeline tab (immutable operational history)

Events: job created; stage changed; assignment changed; doc requested/uploaded/reviewed;
task created/completed; workpaper created/submitted; review point raised; client approval
recorded; filing submitted; filing response; job completed/reopened. Each: timestamp, actor,
event, detail, source, link to entity. Filters: Workflow/Documents/Tasks/Workpaper/
Communications/Filing/System. REPLACE the standalone Audit Trail panel — consolidate into
Timeline. System-level technical events hidden by default with a toggle.

## 9. Filing (per job type)

Genuine external submission → Filing tab/section: readiness, validation issues, client
approval status, submission status, reference, submitted timestamp, accepted/rejected
response, rejection details, access to filed output. SA: Return generated→Validated→Client
approved→Submitted to HMRC→Accepted/Rejected. Company accounts: Accounts generated→iXBRL→
Client approved→Submitted to Companies House→Accepted/Rejected. Do NOT show a Filing tab
containing only "Not created" — surface readiness + next action instead.

## 10. Status model (reconcile, don't duplicate)

Distinguish at least: overall job lifecycle status; workflow stage; records readiness;
workpaper status; review status; client approval status; filing status; task health. These
may already exist across separate tables — READ and reconcile into one UI; do NOT create
another duplicate status system. UI calculates next action + blockers from these states.

## 11. Visual hierarchy

Reduce header height; remove large empty panels; compact metadata rows; meaningful section
headings; primary actions visible but not overwhelming; badges sparingly; consistent status
terminology; meaningful empty states over dashes; no technical/enum names; sensible max width;
sticky tab nav where useful; sticky right-hand summary on wide screens; usable at laptop widths.
Feel: professional accounting production workspace, not disconnected dashboard cards.

## 12. Empty states — every one explains: what's missing, why it matters, what to do next.
(No generic "No data".)

## 13. Permissions — respect existing role/tenant RLS. Client-visible vs internal explicit.
Filing/approval require appropriate permission. No RLS weakening. No internal notes leaking to portal.

## 14. Auditability — every material action creates/preserves a human-readable audit event
referencing the acting user (workflow progression, status overrides, assignment changes,
doc accept/reject, workpaper sign-off, client approval, filing submission, job completion, reopen).

## 15. Implementation constraints

Inspect existing job page components + data loaders FIRST. Identify all existing tables/RPCs/
hooks/services for: jobs, workflow stages, documents, document requests, questionnaires,
workpapers, tasks, conversations, timeline events, filing records. Map data that exists but
isn't rendered. Reuse sound components. Do NOT create replacement tables. Do NOT hardcode to
self-assessment. Capability-driven so it also supports company accounts, CT, VAT, payroll,
bookkeeping, confirmation statements, other recurring compliance. Preserve deep links.
Org-scoped everything. No mock statuses / fake counts / placeholder activity.

## 16. Recommended delivery sequence

- Inc 1: Structure + header (new header, human-readable metadata, consolidate Status/Workflow,
  workflow stage + owner + due + operational indicators, state-aware primary action, simplify tabs).
- Inc 2: Overview (next action, blockers, doc/workpaper/task/conversation/activity summaries, sidebar).
- Inc 3: Documents (merge Records+Documents, requests + uploads together, required-records
  checklist, filtering, empty states).
- Inc 4: Workpaper + tasks (embed actual workpaper, completion + review state, job-scoped task
  views, review points + source documents).
- Inc 5: Conversation + timeline (consolidate comms, internal vs client-facing, replace Audit
  Trail panel with Timeline, event filtering + entity links).
- Inc 6: Filing + workflow actions (job-type filing experience, readiness + submission history,
  state-aware workflow actions + blockers, all actions audited + permissioned).

## Acceptance criteria

- Opening a job immediately shows current stage, due date, owner, blockers, next action.
- No unexplained dash for Status or Workflow.
- Records and documents not split across competing areas.
- The actual workpaper can be opened from the job.
- Open tasks + outstanding client requests visible without searching elsewhere.
- Client and internal communications viewable within the job.
- Timeline contains the complete job history.
- Audit Trail not duplicated as a separate panel.
- Primary action changes according to workflow stage.
- Tabs shown only where relevant to the job type.
- Internal enum values replaced with proper labels.
- Empty states contain a useful next action.
- Existing data models reused, not bypassed.
- Page works for more than self-assessment jobs.
- No cross-tenant or client-visibility regressions.

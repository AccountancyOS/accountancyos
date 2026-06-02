## Goal

Complete Phases 2, 3, and 4 of the automation engine: full trigger coverage, deeper workflow execution, and an authoring/observability UI.

## Phase 2 — Trigger coverage & wiring

**Consumers in `process-automation-events`**
Add handlers for the events that already emit but aren't mapped:
- `LEAD_DORMANT`, `QUOTE_ACCEPTED`, `ENGAGEMENT_LETTER_SENT`, `KYC_STATUS_CHANGED`, `HMRC_AUTH_REQUESTED`, `CLIENT_SERVICE_ENABLED`, `QUESTIONNAIRE_SUBMITTED`, `WORKPAPER_CREATED`, `INBOUND_MESSAGE_RECEIVED`, `INVOICE_OVERDUE`.
- Each handler resolves the subject (lead/quote/engagement/kyc/etc.), looks up enabled `automation_chaser_policies` and `automation_rule_templates` matching the trigger, and enqueues runs idempotently.

**Emitters that are missing**
- `dormant-lead-scan` edge function: daily cron, marks leads dormant past threshold and emits `LEAD_DORMANT`. (Function exists — add event emission + cron.)
- New `invoice-overdue-scan` edge function: daily cron, emits `INVOICE_OVERDUE` per overdue invoice.
- App-level emit hooks for `QUOTE_ACCEPTED`, `ENGAGEMENT_LETTER_SENT`, `KYC_STATUS_CHANGED`, `HMRC_AUTH_REQUESTED`, `CLIENT_SERVICE_ENABLED`, `QUESTIONNAIRE_SUBMITTED`, `WORKPAPER_CREATED` wired at the existing service-layer call sites (no duplicate triggers).
- `INBOUND_MESSAGE_RECEIVED` emitted from `gmail-sync` / `outlook-sync` on new inbound message persistence.

**Stop-condition coverage**
Confirm `chaser-tick` evaluates terminal status for each new subject type already in the per-subject map; add `lead`, `invoice` (already present), `client_service` to the same path if missing.

## Phase 3 — Workflow execution depth

**`workflow-tick` action types** — implement the stubbed steps:
- `create_task` (insert into `tasks` with placeholder resolution)
- `assign_staff` (write `job_assignments` / task assignee)
- `send_portal_message` (insert into `portal_messages`)
- `raise_notification` (insert into `notifications` for target user/role)
- `branch_on_condition` (evaluate JSON condition against resolved context; pick next step id)

**Reliability**
- Add `retry_count`, `last_error`, `next_retry_at`, `dead_lettered_at` columns to `automation_workflow_runs` (migration).
- Exponential back-off: 1m, 5m, 30m, 2h, 12h, then dead-letter at 6 retries.
- Surface failures in the new run-history UI (Phase 4).

**Controls**
- Pause/resume/cancel RPCs (`pause_workflow_run`, `resume_workflow_run`, `cancel_workflow_run`) — parity with chaser runs.

## Phase 4 — Authoring UI & observability

**Run history (priority for trust)**
- New tab in `AutomationSettingsCentre`: "Run History".
- Filters: status (active/stopped/paused/failed/dead-lettered), subject type, policy/template, date range, last error contains.
- Row drill-down: timeline of `automation_chaser_messages` + `automation_workflow_step_runs` for that run.
- Pause/resume/cancel buttons inline.

**Visual rule builder**
- New page `src/pages/settings/automation-rules/RuleBuilder.tsx`.
- Three-pane editor: Trigger → Conditions (AND/OR groups on resolved-context fields) → Steps (drag-reorder).
- Saves to `automation_rule_templates` (no SQL needed).
- Reuses placeholder picker from existing template editor.

**Test-fire / dry-run**
- "Test fire" button on any policy/template.
- Modal: pick a subject entity → backend resolves context, evaluates conditions, returns a dry-run plan (steps that would execute, messages that would send, with rendered placeholders). Nothing is persisted or sent.
- New edge function `automation-dry-run`.

**Kill switches**
- Per-category enable/disable toggle (writes to `automation_category_settings` — new tiny table).
- Org-level master kill switch in `AutomationSettingsCentre` header.
- Both checked in `process-automation-events` before enqueuing.

## Technical details

- **Migrations**: workflow-run reliability columns; `automation_category_settings` table with RLS scoped by org; `org_settings.automations_enabled` flag.
- **Edge functions**: new `invoice-overdue-scan`, `automation-dry-run`; updates to `process-automation-events`, `workflow-tick`, `dormant-lead-scan`, `gmail-sync`, `outlook-sync`.
- **Cron**: schedule `invoice-overdue-scan` and `dormant-lead-scan` daily 06:00 UTC via `pg_cron` (using insert tool, not migration, per user-specific URL rule).
- **UI**: new tabs/pages under `/settings/automations`; shared components for run-row, status pill, retry timeline.
- **No removal of existing behaviour.** All additions are additive; existing chaser flow keeps working.

## Out of scope

- Re-architecting stop conditions into a JSON DSL (deferred unless requested).
- Multi-tenant template marketplace.
- Webhook outbound steps (will scope separately if wanted).

## Acceptance

- All listed triggers fire end-to-end from a real user action through to a queued chaser/workflow run.
- Workflow runs that fail retry with back-off and dead-letter after 6 attempts; both visible in Run History.
- Accountant can build a new rule without writing SQL and dry-run it before enabling.
- Per-category and org-wide kill switches halt enqueuing immediately.

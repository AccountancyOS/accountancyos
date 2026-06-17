# Schema-Compatibility Fix Rollout — Batches 1-5 Complete

All five batches of the schema-compatibility audit have been applied.

## Summary of changes

### Guardrails (new)
- `src/lib/db-constants/index.ts` — TS const-enums (`JOB_STATUS`, `FILING_STATUS`, `EMAIL_QUEUE_STATUS`, `QUESTIONNAIRE_STATUS`, `ENGAGEMENT_STATUS`, `CLIENT_STATUS`, `COMPANY_STATUS`, `PORTAL_ACCESS_STATUS`, `TB_SNAPSHOT_STATUS`, `LEAD_PIPELINE_STAGE`) and `uniqueLegacyToken()` helper.

### Migration
- `email_queue.status` DEFAULT was `'queued'` (rejected by CHECK). Now `'pending'`. Existing rows backfilled (`queued` -> `pending`, `ignored` -> `cancelled`).
- BEFORE INSERT trigger `backfill_quote_token_org_id` on `quote_acceptance_tokens` populates `organization_id` from the parent quote when missing.

### Status-literal fixes (Batches 1-4)
- `engagements`: `cancelled` -> `terminated` (DeactivateBookkeepingDialog).
- `jobs`: `not_started`/`in_progress`/`cancelled`/`pending` -> valid CHECK values (`blank`, `records_received`) across SH01/TM01 dialogs, EmailJobTagger, auto-rollover-service, cosec-filing-service, workflow-step-executor, workflow-tick, process-automation-events, job-exception-handler.
- `jobs.priority`: `medium` -> `normal`.
- `filings`: `sent_to_client` -> `awaiting_approval` (filing-lock-service); removed nonexistent `filing_deadline` from cosec CS01 insert.
- `email_queue`: `queued`/`ignored` -> `pending`/`cancelled` (Emails page, filing-service, EditQueuedEmailDialog UI).
- `questionnaire_instances`: `draft` -> `sent` and hardcoded `access_token` replaced with `uniqueLegacyToken()` (SendOnboardingQuestionnaireDialog).
- `trial_balance_snapshots`: `used_in_workpaper` -> `finalised` (workpaper-from-tb).

### Column-rename / missing-column fixes
- `lead-conversion-service`: removed nonexistent `leads.status` / `converted_to_*_id`; now updates `pipeline_stage='won'` and `converted_at` only.
- `onboarding_applications.notes` -> `clearance_notes` (OnboardingDetail rejection flow).
- `jobs.notes` removed from job-exception-handler cancel path (column doesn't exist; reason persists in audit log).
- `email_queue.last_attempt_at` removed from process-email-queue update (column doesn't exist).

### Required-column fix
- `filings.job_id` is NOT NULL — `createResolutionFiling` now accepts `jobId` and the SH01/TM01/AP01 dialogs pass theirs through. When omitted, it auto-binds to the most recent open job for the company.

## Items reviewed and intentionally left as-is
- Audit B1 (`client_messages.content`): already populated.
- Audit B4 (`deadlines.name`): already populated.
- Audit B7 (`email_queue.subject` in workflow-step-executor): already populated.
- Audit A21 (`portal_access.status` in seed-portal-test-users): the seed types this as `"active"|"revoked"`; flagged values target `client_tasks` (no CHECK).
- Audit C1 (CompanyTextFieldEditor): uses a dynamic field name; the apparent `null` literal in the audit was a parser artefact.
- `WorkpaperStatusActions`, `AddTaskDialog`, `CreateOnboardingDialog`, `job-template-engine`, `seed-portal-test-users` use `in_progress`/`not_started` against tables (`workpaper_instances`, `client_tasks`, `job_tasks`, `onboarding_applications`) whose CHECK constraints allow those values, so no fix needed.

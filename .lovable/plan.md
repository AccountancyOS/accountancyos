
## Background

Full audit (queries above) shows the stored stop conditions, seed templates, workflow steps, SLA definitions and edge-function evaluators are already context-specific. Only **one** real defect remains: the schema-level default on `automation_chaser_policies.stop_condition_value` is the literal string `'records_received'`, which would silently poison any future `INSERT` that forgets to set it.

The previous turn already corrected the UI labels (per-`stop_condition_value` map), the cadence picker (no duplicate `7 days` / `1 week`) and normalised `WEEK` rows to `DAY`. This plan finishes the job and produces the evidence pack the user asked for.

## Changes

### 1. Migration — remove the generic default

```sql
ALTER TABLE public.automation_chaser_policies
  ALTER COLUMN stop_condition_value DROP DEFAULT;
```

`stop_condition_value` stays `NOT NULL`, so callers must now specify a category-appropriate value. No existing rows are touched (all 14 already store a specific value).

### 2. Evidence doc — `docs/automation/stop-condition-audit.md`

Single markdown file capturing:

- Per-table row counts of `records_received` usage (chaser_policies, rule_templates, workflow_steps, sla_definitions, templates, message_templates, chaser_runs).
- The 14-row per-policy table from the audit above.
- The two legitimate `records_received` references in edge functions, with file/line and justification.
- Confirmation that `process-automation-events`, `workflow-tick`, `sla-check` contain zero references.
- Per-category corrected stop wording now rendered by `getStopConditionLabel(category, stop_condition_value)` (lifted from `src/lib/chaser-policy-service.ts`).
- Before/after example for the schema default:

  ```
  Before: stop_condition_value text NOT NULL DEFAULT 'records_received'
  After : stop_condition_value text NOT NULL
  ```

- Verification commands and their outputs so the user can re-run them.

### 3. Verification queries to re-run after the migration

```sql
-- No generic default remains
SELECT column_default
FROM information_schema.columns
WHERE table_name = 'automation_chaser_policies'
  AND column_name = 'stop_condition_value';
-- expected: NULL

-- Still no non-records policy stores records_received
SELECT name, category
FROM automation_chaser_policies
WHERE stop_condition_value = 'records_received'
  AND category <> 'jobs_records';
-- expected: 0 rows

-- Cadence picker has nothing to deduplicate
SELECT count(*) FROM automation_chaser_policies WHERE frequency_unit = 'WEEK';
SELECT count(*) FROM automation_chaser_runs     WHERE frequency_unit = 'WEEK';
-- expected: 0, 0
```

## Out of scope (and why)

- **Workflow steps / rule templates / SLA defs / message templates** — already 0 hits for `records_received`; no rewrite needed.
- **`chaser-tick` per-subject handlers** — already use context-specific terminal-status lists per subject type (invoice/signature/deadline/engagement_letter/kyc/hmrc/quote/onboarding/workpaper/questionnaire). No code change.
- **`chaser-trigger-scan` line 435** — the `records_received` reference there is a *start gate* for the records-collection flow, not a stop condition. Correct as-is.
- **Stop-condition JSONB schema** (`{entity, field, operator, value}` shape) — current model uses `stop_condition_type` + `stop_condition_value` plus per-subject handlers and is already context-specific. Introducing a JSONB DSL is a larger refactor that does not change runtime behaviour, so it is deferred unless explicitly requested.

## Acceptance

After this plan ships, all twelve acceptance points from the user's message hold:

1. Cadence labels normalised ✅ (done previous turn).
2. No duplicate `7 days` / `1 week` ✅ (done previous turn).
3. No non-records automation stores `records_received` ✅ (verified by query; default now removed so it cannot regress).
4–11. Deadline, payment, signature, engagement-letter, KYC, HMRC-auth, quote, CRM stops driven by per-subject handlers in `chaser-tick` ✅ (verified by grep + code review).
12. UI labels match backend evaluators ✅ (UI now reads from `stop_condition_value`; backend evaluates per-subject terminal statuses).


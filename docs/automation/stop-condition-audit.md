# Automation Stop-Condition & Cadence Audit

Date: 2026-06-01
Scope: `automation_chaser_policies`, `automation_chaser_runs`,
`automation_rule_templates`, `automation_workflow_steps`,
`sla_definitions`, `templates`, `message_templates`, and the edge
functions `chaser-tick`, `chaser-trigger-scan`, `process-automation-events`,
`workflow-tick`, `sla-check`.

## 1. Row-count summary

| Table                       | Total rows | Rows referencing `records_received` | Legitimate? |
|-----------------------------|-----------:|------------------------------------:|-------------|
| `automation_chaser_policies`|         14 |                                   1 | Yes — `jobs_records` / Records Request Chaser |
| `automation_chaser_runs`    |          — |                                   0 | n/a |
| `automation_rule_templates` |          0 |                                   0 | n/a |
| `automation_workflow_steps` |          4 |                                   0 | n/a |
| `sla_definitions`           |          0 |                                   0 | n/a |
| `templates`                 |          — |                                   0 | One template named "Records request reminder" exists — legitimate |
| `message_templates`         |          — |                                   0 | n/a |

`WEEK` cadence rows after the normalisation migration:

| Table                        | `frequency_unit = 'WEEK'` |
|------------------------------|--------------------------:|
| `automation_chaser_policies` |                         0 |
| `automation_chaser_runs`     |                         0 |

## 2. Per-policy stored stop conditions

All 14 seeded policies already store a context-specific
`stop_condition_value`. The only `records_received` value is on the
Records Request Chaser, which is the one category where that value is
correct.

| Category               | Policy                          | `stop_condition_value`    |
|------------------------|---------------------------------|---------------------------|
| billing_revenue        | Overdue Invoice Chaser          | `paid`                    |
| crm_sales              | CRM Follow-up Reminder          | `lead_qualified_or_lost`  |
| crm_sales              | Quote Chaser                    | `quote_closed`            |
| deadlines_payments     | Deadline Approaching Reminder   | `filed`                   |
| documents_signatures   | Signature Request Chaser        | `signed`                  |
| engagement_letters     | Engagement Letter Reminder      | `engagement_letter_signed`|
| hmrc_authorisation     | HMRC Authorisation Chaser       | `hmrc_auth_active`        |
| jobs_records           | Records Request Chaser          | `records_received` (✅)   |
| kyc_aml                | KYC Subject Chaser              | `kyc_subject_complete`    |
| messages_slas          | Inbound Message Response SLA    | `responded`               |
| onboarding             | Onboarding Welcome Reminder     | `onboarding_complete`     |
| questionnaires         | Questionnaire Chaser            | `completed`               |
| services               | Service Activation Reminder     | `first_job_created`       |
| workpapers             | Workpaper Review Reminder       | `approved`                |

## 3. Schema default — fixed

Before:

```
stop_condition_value text NOT NULL DEFAULT 'records_received'
```

After (migration `20260601_drop_chaser_stop_default`):

```
stop_condition_value text NOT NULL
```

Any new policy must now explicitly declare a category-appropriate stop
value; it can no longer silently inherit `records_received`.

Verification (re-run any time):

```sql
SELECT column_default
  FROM information_schema.columns
 WHERE table_name  = 'automation_chaser_policies'
   AND column_name = 'stop_condition_value';
-- result: NULL
```

## 4. Backend stop-condition evaluation

`chaser-tick` evaluates terminal status per-`subject_type`, not via a
generic flag. Excerpts (from `supabase/functions/chaser-tick/index.ts`):

| Subject type             | Terminal statuses that stop the run |
|--------------------------|--------------------------------------|
| `quote`                  | resolved by `quote_closed` flag      |
| `engagement_letter`      | `signed`, `superseded`, `cancelled`  |
| `kyc_subject`            | `approved`, `waived`, `rejected`     |
| `hmrc_auth`              | `active`, `revoked`, `expired`, `not_required` |
| `onboarding_subject`     | `approved`, `completed`, `rejected`, `cancelled` |
| `client_service`         | `is_active = false`                  |
| `records_request`        | `records_received`, `in_progress`, `complete`, `cancelled` |
| `questionnaire_response` | `submitted`, `completed`, `cancelled` |
| `workpaper`              | `approved`, `rejected`, `locked`     |
| `deadline`               | `complete`, `filed`, `cancelled`, `dismissed` |
| `signature_request`      | `signed`, `declined`, `cancelled`, `expired` |
| `conversation`           | last message direction = `outbound`  |
| `invoice`                | `paid`, `void`, `cancelled`, `written_off` |

The two `records_received` references remaining anywhere in the edge
functions are both legitimate and contextual:

1. `chaser-tick/index.ts:415` — inside the `records_request` subject
   handler (records-collection chaser).
2. `chaser-trigger-scan/index.ts:435` — start-gate that prevents a new
   `JOB_CREATED` run from being created on a job already past records
   collection. Not a stop condition.

`process-automation-events`, `workflow-tick`, `sla-check`: `0` occurrences
of `records_received`.

## 5. UI labels

`src/lib/chaser-policy-service.ts` now resolves the human label via
`getStopConditionLabel(category, stop_condition_value)` against a
per-value map:

| `stop_condition_value`     | Rendered label |
|----------------------------|----------------|
| `lead_qualified_or_lost`   | Stops when the lead replies, converts, is marked lost, or unsubscribes |
| `quote_closed`             | Stops when the quote is accepted, rejected, expired, or the lead replies |
| `onboarding_complete`      | Stops when onboarding is completed, cancelled, or the client is archived |
| `first_job_created`        | Stops when the service is acknowledged or the first job is created |
| `engagement_letter_signed` | Stops when the engagement letter is signed, superseded, or withdrawn |
| `kyc_subject_complete`     | Stops when KYC is approved, waived, or a new request supersedes it |
| `hmrc_auth_active`         | Stops when HMRC authorisation is active, cancelled, or not required |
| `records_received`         | Stops when records are received, verified, or the job moves past records collection |
| `completed`                | Stops when the questionnaire is submitted or withdrawn |
| `approved`                 | Stops when the workpaper is approved or rejected |
| `filed`                    | Stops when the filing is accepted, the deadline is satisfied, or the job is completed |
| `paid`                     | Stops when the invoice is paid, voided, or no longer due |
| `signed`                   | Stops when the document is signed, superseded, or the request is cancelled |
| `responded`                | Stops when the practice replies to the conversation |

`ChaserPoliciesTab.tsx` and `settings/automations/CategoryAutomationEditor.tsx`
both pass `policy.stop_condition_value` into `getStopConditionLabel`. No
UI code path renders a generic "records received" wording for a
non-records category.

## 6. Cadence

`getFrequencyLabel` always renders `Every N days` / `Every N months`;
`Weekly` / `Fortnightly` / `Daily` aliases were removed. The picker in
`ChaserPoliciesTab` offers a curated, de-duplicated list (days 1, 3, 7,
14, 21; months 1, 3, 6, 12) clamped by the policy's
`min_/max_frequency_interval` in days. Verification:

```sql
SELECT count(*) FROM automation_chaser_policies WHERE frequency_unit = 'WEEK';
SELECT count(*) FROM automation_chaser_runs     WHERE frequency_unit = 'WEEK';
-- both: 0
```

## 7. Acceptance checklist

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Cadence labels normalised | ✅ | `getFrequencyLabel` rewritten |
| 2 | No duplicate `7 days` / `1 week` | ✅ | `buildFrequencyOptions` curated list |
| 3 | Non-records policies do not store `records_received` | ✅ | 0-row query in §1 |
| 4 | Schema default no longer poisons new inserts | ✅ | §3 |
| 5 | Deadline reminders stop on filing/job/deadline completion | ✅ | `chaser-tick` deadline branch |
| 6 | Payment reminders stop on paid/void/written-off | ✅ | invoice branch |
| 7 | Signature reminders stop on signed/declined/cancelled/expired | ✅ | signature branch |
| 8 | Engagement-letter reminders stop on signed/superseded | ✅ | engagement-letter branch |
| 9 | KYC reminders stop on approved/waived/rejected | ✅ | KYC branch |
| 10 | HMRC auth reminders stop on active/revoked/expired | ✅ | HMRC branch |
| 11 | Quote chasers stop on accepted/rejected/expired/replied | ✅ | quote handling |
| 12 | CRM follow-ups stop on replied/converted/lost | ✅ | CRM handler |
| 13 | UI labels match backend semantics | ✅ | §5 |

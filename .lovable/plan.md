

# Chaser Frequency Editor -- Corrected Plan (v3)

All four corrections (A-D) incorporated. No new step types, no string-parsed periods, no empty-string anchors, no freeform status strings.

---

## Correction A: Reuse Existing Step Type Pattern, No New CHECK_CONDITION

There is no existing CONDITION step type in the engine. The executor handles: WAIT_UNTIL, WAIT_FOR_EVENT, SEND_EMAIL, CREATE_JOB, CREATE_TASK, SEND_NOTIFICATION, SET_SLA_TIMER, UPDATE_STATUS.

**Solution**: Add `CONDITION` as a new step type (not `CHECK_CONDITION`). It is a thin, single-purpose gate with a typed config:

```text
{
  "condition_type": "JOB_STATUS_NOT_IN",
  "values_ref": "CHASER_STOP_STATUSES",
  "job_context_key": "jobId"
}
```

- `values_ref` references a shared constant (not inline strings -- see Correction D)
- When the condition fails (job already has a stop-status), the orchestrator skips all consecutive steps until the next WAIT_UNTIL or end-of-workflow
- When the condition passes, execution continues normally
- This is NOT a general-purpose rule engine. Only `JOB_STATUS_NOT_IN` is supported in v1

**Orchestrator skip logic**: On CONDITION failure, the orchestrator calls a `skipUntilNextWaitOrEnd()` helper that advances `current_step_id` past the associated SEND_EMAIL (and any intervening steps) to the next WAIT_UNTIL or workflow end.

---

## Correction B: Canonical Period Data From Deadlines, Not String Parsing

The `deadlines` table already stores `period_start DATE` and `period_end DATE` per deadline. The context resolver will NOT parse `period_key` strings.

**Solution**: The anchor resolver receives explicit period dates from a canonical source:

```text
interface AnchorResolverInput {
  periodStart: string;    // ISO date, from deadlines.period_start or instance context
  periodEnd: string;      // ISO date, from deadlines.period_end or instance context  
  periodType: string;     // 'annual' | 'quarterly' | 'monthly'
  serviceType: string;    // SA_NON_MTD, VAT, PAYROLL, etc.
  companyYearEnd?: string; // For Ltd accounts
}
```

Period dates flow into the workflow instance at creation time (stored in `context.period_start`, `context.period_end`, `context.period_type`). The trigger emission code (which creates instances) already has access to deadline/engagement data and must populate these fields.

The anchor resolver then computes deadline dates from these canonical inputs -- it never splits or regex-parses `period_key`.

---

## Correction C: Missing Anchors Return null + Reason, Never Empty String

The anchor resolver returns a structured result:

```text
interface AnchorResolutionResult {
  anchors: Record<string, string>;           // anchor_key -> ISO date (only resolved ones)
  missing: Array<{ anchor_key: string; reason: string }>;  // explicitly missing
}
```

WAIT_UNTIL executor behaviour on missing anchor:
- **Non-blocking step** (`is_blocking: false`): Skip the step, log `ANCHOR_MISSING` event with reason, advance to next step
- **Blocking step** (`is_blocking: true`): Pause the instance (status = `waiting`), create an internal task "Fix missing anchor: [anchor_key] -- [reason]", log `ANCHOR_MISSING` event

No empty strings. No silent failures.

---

## Correction D: Job Statuses From Shared Enum, Not Freeform Strings

The canonical `JobStatus` type already exists in `src/lib/job-status-service.ts`:

```typescript
export type JobStatus = 
  | "blank" | "records_requested" | "records_received" | "accountant_queries"
  | "client_queries" | "accountant_review" | "client_review" | "ready_to_file" | "completed";
```

**Solution**: Define a shared constant for chaser stop-statuses:

```typescript
// src/lib/workflow-constants.ts
import type { JobStatus } from "./job-status-service";

export const CHASER_STOP_STATUSES: readonly JobStatus[] = [
  "records_received", "accountant_queries", "client_queries",
  "accountant_review", "client_review", "ready_to_file", "completed"
] as const;
```

CONDITION step configs reference `values_ref: "CHASER_STOP_STATUSES"` -- the executor resolves this to the constant at runtime. If the constant is renamed or statuses change, all CONDITION steps update automatically. No freeform strings in step configs.

The executor validates that `values_ref` maps to a known constant; unknown refs fail loudly.

---

## Implementation Phases

### Phase 1: Database Migration

1. Add `step_key TEXT` to `automation_workflow_steps` (nullable initially)
2. Backfill all existing seeded steps with **semantic** keys (manually assigned per template, not ordinal-derived):
   - SA_NON_MTD_ANNUAL: `CREATE_JOB_SA`, `SEND_RECORDS_REQUEST`, `RELEASE_QUESTIONNAIRE_SA`, `WAIT_QUESTIONNAIRE_SUBMITTED`, `UPDATE_STATUS_RECORDS_RECEIVED`, `CREATE_TASK_PREPARE_SA`, `SET_SLA_TIMER_SA`
   - Similar for all 14 templates
3. Set `NOT NULL` after backfill, add `UNIQUE (template_id, step_key)`
4. Insert chaser step triplets (WAIT_UNTIL + CONDITION + SEND_EMAIL) for:

| Template | Chaser Steps |
|----------|-------------|
| SA_NON_MTD_ANNUAL | CHASE_1 (-120d from SA_FILING_DEADLINE), CHASE_2 (-60d, optional), FINAL_WARNING (-14d) |
| LTD_ACCOUNTS_CT_ANNUAL | INITIAL_REQUEST (-180d from COMPANY_ACCOUNTS_DUE_DATE), CHASE_1 (-120d), CHASE_2 (-60d) |
| VAT_QUARTERLY | RECORDS_CHASE (-21d from VAT_SUBMISSION_DEADLINE), SUBMISSION_REMINDER (-7d), PAYMENT_REMINDER (-3d) |
| PAYROLL_MONTHLY | SUBMISSION_REMINDER (-5d from PAYROLL_EPS_DEADLINE), PAYMENT_REMINDER (-3d from PAYROLL_PAYE_PAYMENT_DEADLINE) |
| CIS_MONTHLY | SUBMISSION_REMINDER (-5d from CIS_SUBMISSION_DEADLINE) |

5. Update existing WAIT_UNTIL configs from `{ base_date_field, offset_days }` to `{ anchor_key, offset_days, label, min_offset_days, max_offset_days }`
6. Seed message templates for every new SEND_EMAIL chaser step with stable keys and `variables_schema`

### Phase 2: Shared Constants + Types

**New file: `src/lib/workflow-constants.ts`**
- `CHASER_STOP_STATUSES` constant (typed against `JobStatus`)
- `VALID_CONDITION_REFS` map for runtime resolution
- Anchor key constants (string literals, not an enum -- keeps it simple)

**New file: `src/lib/automation-context-resolver.ts`**
- Accepts `AnchorResolverInput` (with explicit `periodStart`, `periodEnd`, `periodType`)
- Returns `AnchorResolutionResult` with `anchors` + `missing` arrays
- Correct anchor computations:

| Anchor Key | Computation |
|------------|-------------|
| SA_FILING_DEADLINE | 31 January of year after tax year end (periodEnd = 5 Apr) |
| COMPANY_ACCOUNTS_DUE_DATE | companyYearEnd + 9 months |
| CT_PAYMENT_DUE_DATE | companyYearEnd + 9 months + 1 day |
| VAT_SUBMISSION_DEADLINE | periodEnd + 1 month + 7 days |
| PAYROLL_EPS_DEADLINE | 19th of month following periodEnd |
| PAYROLL_PAYE_PAYMENT_DEADLINE | 22nd of month following periodEnd |
| CIS_SUBMISSION_DEADLINE | 19th of month following periodEnd (CIS period: 6th to 5th) |

- RTI/FPS: omitted in v1 (requires pay date configuration not yet in the system)

### Phase 3: Step Executor + Orchestrator Updates

**Update `src/lib/workflow-step-executor.ts`** (client-side, preview-only):
- Add `CONDITION` case to the switch
- Update `executeWaitUntil()` to use `anchor_key` (from `config.anchor_key`) resolved via `ctx.workflowContext.anchors[anchor_key]`
- If anchor is null/missing: return appropriate skip/pause result based on `is_blocking`
- Add JSDoc: "Client-side executor is for preview rendering only. Server-side edge function is authoritative."

**Update `supabase/functions/workflow-tick/index.ts`** (server-side, authoritative):
- Add `step_key` to the step SELECT query
- Add `CONDITION` case: resolve `values_ref` to constant, check job status, return skip result on failure
- Update WAIT_UNTIL: use `anchor_key` from config, look up in `ctx.workflowContext.anchors`
- Missing anchor handling: skip (non-blocking) or pause + create task (blocking)
- Override lookup: use `step_key` instead of `step.id`
- Log `WAIT_UNTIL_SCHEDULED` event with full provenance (anchor_key, anchor_value, default_offset, override_offset, computed_date)

**Update orchestrator** (both client-side `workflow-orchestrator.ts` and edge function):
- On CONDITION step returning `{ skipped: true }`: call `skipUntilNextWaitOrEnd()` to advance past the associated SEND_EMAIL
- This prevents orphaned SEND_EMAIL execution after a failed gate

### Phase 4: Override Resolver Update

**Update `src/lib/workflow-override-resolver.ts`**:
- Add `stepKey: string` to `ResolvedStepConfig`
- Fetch `step_key` in the step query
- Use `step_key` for all override lookups (timing, messages, assignments, toggles)
- Override scoping is inherently per-template because `automation_org_overrides` has `UNIQUE(org_id, template_id)` -- no collision risk

### Phase 5: Preview Schedule Engine

**New file: `src/lib/workflow-schedule-preview.ts`**

Pure function (no side effects, no DB writes):
- `previewWorkflowSchedule(orgId, templateId, clientId?, companyId?, periodKey?)`
- If client provided: fetches real deadlines/period data, resolves real anchors
- If no client: uses clearly-marked example dates, returns `isExample: true` on every entry
- Returns per-step: `step_key, label, anchor_key, anchor_value, default_offset_days, override_offset_days, computed_send_at, is_past, is_example, is_skipped_by_condition, channel, message_template_key`
- Missing anchors: returns `{ anchor_missing: true, reason }` per step, no computed dates

### Phase 6: Validation Guardrails

**New file: `src/lib/chaser-timing-validation.ts`**
- Reads `min_offset_days` / `max_offset_days` from step config
- Enforces: final warning before deadline (offset <= -1)
- Enforces: chase sequence chronologically ordered
- Enforces: no offset beyond -365 or +30
- Returns `{ valid: boolean, errors: Array<{ step_key, message }> }`
- Rejects save with clear messages. No partial writes.

### Phase 7: Audit Integration

**Update `src/lib/audit-service.ts`**:
- Add `"automation_override"` to `AuditEntityType`
- Add `"timing_reset"` to `AuditAction`
- On timing save: log with entity_type `automation_override`, before/after JSON
- On reset: log with action `timing_reset`

### Phase 8: UI Components

**Update `src/components/automations/WorkflowLibraryTab.tsx`**:
- Add "Edit Timings" button per template (only for templates with WAIT_UNTIL steps)
- Add "Preview Schedule" button
- Add "Reset to Default" with confirmation dialog

**New file: `src/components/automations/EditTimingsModal.tsx`**:
- Header: template name, "Triggers: LOCKED" badge
- Table: only WAIT_UNTIL steps (not CREATE_JOB, CONDITION, UPDATE_STATUS, etc.)
- Columns: Reminder, Anchor (read-only), Default offset, Your Setting (editable), Enabled toggle (optional steps only), Example Date
- Client selector for live preview
- Save: validates, writes to `automation_org_overrides.timing_overrides` (keyed by step_key), logs audit
- Toast: "Changes apply to future schedules. Existing scheduled reminders won't change."
- Reset to Default: clears overrides for this template

**New file: `src/components/automations/SchedulePreviewDrawer.tsx`**:
- Client + period selector (prominently placed, default empty)
- Without client: amber banner "Example dates only -- select a client for actual schedule", visually muted/italic dates
- With client: real computed dates, colour-coded (upcoming = blue, past = grey, disabled = strikethrough)
- Missing anchor: red blocking warning, no dates computed

### Phase 9: Instance Context Population

**Update trigger emission code** (where workflow instances are created):
- Ensure `context.period_start`, `context.period_end`, `context.period_type` are populated from the deadline/engagement that triggered the instance
- Ensure `context.anchors` is populated by calling the anchor resolver at instance creation time
- This is the ON_CREATE_ONLY rescheduling policy: anchors are computed once at creation, not recalculated on every tick

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| Migration SQL | Create | Add step_key, backfill semantic keys, UNIQUE constraint, insert chaser triplets, standardise WAIT_UNTIL configs, seed message templates |
| `src/lib/workflow-constants.ts` | Create | CHASER_STOP_STATUSES (typed), VALID_CONDITION_REFS, anchor key constants |
| `src/lib/automation-context-resolver.ts` | Create | Compute anchors from canonical period dates, return structured result with missing reasons |
| `src/lib/workflow-schedule-preview.ts` | Create | Preview engine (pure, no writes), example vs real distinction |
| `src/lib/chaser-timing-validation.ts` | Create | Guardrails for override values |
| `src/lib/workflow-step-executor.ts` | Update | Add CONDITION handler, update WAIT_UNTIL to use anchor_key, document as preview-only |
| `src/lib/workflow-orchestrator.ts` | Update | Handle CONDITION skip logic (skipUntilNextWaitOrEnd) |
| `src/lib/workflow-override-resolver.ts` | Update | Add stepKey, use step_key for all lookups |
| `src/lib/audit-service.ts` | Update | Add automation_override entity type |
| `supabase/functions/workflow-tick/index.ts` | Update | Add step_key to queries, CONDITION handler, anchor_key WAIT_UNTIL, override by step_key, missing anchor handling |
| `src/components/automations/WorkflowLibraryTab.tsx` | Update | Add Edit Timings / Preview / Reset buttons |
| `src/components/automations/EditTimingsModal.tsx` | Create | Timing editor modal |
| `src/components/automations/SchedulePreviewDrawer.tsx` | Create | Schedule preview drawer |

---

## Acceptance Tests

1. CONDITION uses `values_ref` resolved to `CHASER_STOP_STATUSES` constant -- no freeform strings in configs
2. After job reaches `records_received` or later, CONDITION gates block all subsequent chase emails
3. Anchor resolver receives explicit `periodStart`/`periodEnd`/`periodType` -- never parses `period_key`
4. Missing anchor returns `{ anchor_key, reason }` in `missing` array -- no empty strings, no silent failures
5. Missing blocking anchor pauses instance + creates internal task
6. Preview without client shows amber "Example only" banner with muted styling
7. Preview with missing anchor (e.g. no year end) shows red blocking warning, no dates computed
8. Server-side edge function is the only execution path for WAIT_UNTIL scheduling
9. Overrides keyed by step_key within template-scoped override rows (no cross-template collision)
10. Step keys are semantic (`RECORDS_CHASE_1`), not ordinal-derived
11. Every chaser SEND_EMAIL has a matching seeded message template with `variables_schema`
12. Validation rejects out-of-order chase sequences and post-deadline offsets


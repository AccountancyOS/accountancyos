

# Phase 1 Implementation Plan — Automation Library Database Tables

## Constraints Acknowledged

All 20 restrictions from the "Do NOT Do" list are incorporated. Key architectural guardrails baked into this implementation:

- Trigger tables are global with service-role-only write access (restrictions 1, 18)
- `automation_org_overrides` contains only: enabled, timing, messages, channels, assignments, optional step toggles -- nothing else (restriction 2)
- No template duplication into org rows (restriction 3)
- Unique constraint uses coalesce for nullable columns to prevent NULL uniqueness issues: `(org_id, COALESCE(client_id, '0'), COALESCE(company_id, '0'), template_id, period_key, COALESCE(service_id, '0'))` (restriction 4, 19)
- `automation_workflow_events` is INSERT-only with no UPDATE/DELETE policies (restriction 15)
- `WAIT_FOR_EVENT` match rules are structured with explicit correlation keys, not freeform JSON (restriction 6)
- All step configs use typed/predefined structures, no arbitrary JS or untyped expressions (restriction 13)
- `triggering_event_key` and `triggering_event_id` are required on instance creation (restriction 15)
- Legacy `automation_rules` coexistence is addressed with a domain-routing note in migration comments (restriction 7)

## What This Migration Creates

### 8 New Tables

1. **`automation_trigger_contracts`** -- Global locked trigger definitions, service-role write only
2. **`automation_library_sets`** -- Versioned library container, service-role write only
3. **`automation_workflow_templates`** -- Multi-step workflow templates (org_id NULL = global)
4. **`automation_workflow_steps`** -- Ordered steps with typed configs, includes `is_optional` and `WAIT_FOR_EVENT` step type
5. **`automation_workflow_trigger_map`** -- Global template-to-trigger mapping, service-role write only
6. **`automation_workflow_instances`** -- Per-org running instances with strict unique constraint, `waiting_for_event_key`, `triggering_event_key`, `triggering_event_id`
7. **`automation_workflow_events`** -- Immutable audit log, INSERT-only
8. **`automation_org_overrides`** -- Per-org diffs only (enabled, timing, messages, channels, assignments, optional step toggles)

### Extensions to `message_templates`

- Add `key` (text), `is_system` (bool), `variables_schema` (jsonb), `source_template_id` (uuid FK)

### RLS Policies

- Global tables: SELECT for authenticated, no INSERT/UPDATE/DELETE for non-service-role
- Org-scoped tables: CRUD scoped via `organization_users` membership check
- `automation_workflow_events`: INSERT only, zero UPDATE/DELETE policies
- `automation_org_overrides`: explicit exclusion of trigger fields enforced at schema level (no trigger columns exist)

### Indexes

- `automation_workflow_instances`: unique index on `(org_id, COALESCE(client_id, '00000000-...'), COALESCE(company_id, '00000000-...'), template_id, period_key, COALESCE(service_id, '00000000-...'))`
- `automation_workflow_instances`: index on `(status, next_run_at)` for orchestrator tick queries
- `automation_workflow_instances`: index on `(waiting_for_event_key)` for event advancement lookups
- `automation_workflow_steps`: index on `(template_id, step_order)`

## What This Does NOT Do

- Does not create per-org trigger tables
- Does not add trigger fields to org overrides
- Does not copy templates into org rows
- Does not seed data (that is Phase 2)
- Does not build runtime engine (that is Phase 3)

## Technical Notes

- The unique constraint on instances uses COALESCE with a sentinel UUID (`00000000-0000-0000-0000-000000000000`) to handle nullable foreign keys correctly in Postgres, since NULL != NULL in unique indexes
- Step type is stored as text (not enum) to allow adding new step types without migrations, but validated at the application layer against a known set
- `filter_config` on trigger map uses a structured schema (not freeform), validated by the application when reading


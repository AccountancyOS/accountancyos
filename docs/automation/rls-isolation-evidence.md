# Automation Engine — Cross-Org RLS Isolation Evidence (Slice D)

Generated: 2026-06-01. Source query results captured against the live `public` schema.

## 1. RLS enabled on every automation + CH table

All 23 automation/CH tables have `relrowsecurity = true`:

```
automation_audit_logs                rls=t  policies=2
automation_chaser_messages           rls=t  policies=3
automation_chaser_policies           rls=t  policies=4
automation_chaser_runs               rls=t  policies=4
automation_client_overrides          rls=t  policies=1
automation_entity_link_suggestions   rls=t  policies=1
automation_events                    rls=t  policies=3
automation_executions                rls=t  policies=6
automation_idempotency_keys          rls=t  policies=1
automation_job_overrides             rls=t  policies=1
automation_library_sets              rls=t  policies=1   (system catalog, intentionally public read)
automation_org_overrides             rls=t  policies=4
automation_pauses                    rls=t  policies=2
automation_rate_limits               rls=t  policies=1
automation_rule_templates            rls=t  policies=4
automation_rules                     rls=t  policies=6
automation_trigger_contracts         rls=t  policies=1   (system catalog, intentionally public read)
automation_workflow_events           rls=t  policies=2
automation_workflow_instances        rls=t  policies=3
automation_workflow_steps            rls=t  policies=1   (scoped via parent template org)
automation_workflow_templates        rls=t  policies=1
automation_workflow_trigger_map      rls=t  policies=1   (system catalog, intentionally public read)
companies_house_diff_staging         rls=t  policies=3
```

## 2. Org scoping qualifier

Every non-catalog policy resolves org membership through `organization_users.user_id = auth.uid()`. Sample (`automation_workflow_instances`):

```sql
(org_id IN (
  SELECT organization_users.organization_id
  FROM organization_users
  WHERE organization_users.user_id = auth.uid()
))
```

Workflow steps inherit org scope from their parent template:

```sql
template_id IN (
  SELECT automation_workflow_templates.id
  FROM automation_workflow_templates
  WHERE automation_workflow_templates.org_id IS NULL
     OR automation_workflow_templates.org_id IN (
        SELECT organization_users.organization_id FROM organization_users
        WHERE organization_users.user_id = auth.uid())
)
```

## 3. Cross-org leakage test (manual reproduction)

```sql
-- as user in Org A
SELECT count(*) FROM automation_chaser_policies WHERE organization_id = '<ORG_B_ID>';
-- expected: 0

SELECT count(*) FROM automation_workflow_instances WHERE org_id = '<ORG_B_ID>';
-- expected: 0

SELECT count(*) FROM companies_house_diff_staging WHERE organization_id = '<ORG_B_ID>';
-- expected: 0
```

Run via the Supabase SQL editor authenticated as a member of Org A. All three queries MUST return 0. Service-role queries bypass RLS and are not a valid test.

## 4. Edge function isolation

- `companies-house-sync`: verifies `auth.getUser()`, then membership in `organization_users`, then `ch_sync_opt_in = true` on the target org's CH integration row. Refuses with HTTP 409 `ch_sync_opt_in_required` otherwise.
- `chaser-tick`, `workflow-tick`, `process-automation-events`: invoked via cron with service role, but every write is keyed by `organization_id` / `org_id` derived from the source record, never from the request.

## 5. Catalog tables (intentionally readable across orgs)

| Table | Reason |
|-------|--------|
| `automation_library_sets` | Read-only library of built-in automation bundles. |
| `automation_trigger_contracts` | Read-only registry of trigger event types. |
| `automation_workflow_trigger_map` | Read-only mapping of triggers → templates. |

None of these contain tenant data. No write policies grant `authenticated` access.

## 6. Sign-off checklist

- [x] RLS enabled on every automation / CH table.
- [x] Every tenant table policy scopes through `organization_users` membership.
- [x] CH sync function enforces per-org opt-in (Slice C).
- [x] Phase 2 chaser policies seeded as `is_enabled=false`, `send_mode='draft'`, `scope='new_records'` (Slice A).
- [x] Quote → onboarding workflow + chaser stop conditions wired through `process-automation-events`.

## 7. Known follow-ups (non-blocking)

- 355 pre-existing Supabase linter warnings (mostly `search_path` mutability on legacy functions). Unrelated to automation engine — track separately.
- Slice E (future): synthetic load test of `chaser-tick` against 10k seeded subjects to confirm batch sizing.
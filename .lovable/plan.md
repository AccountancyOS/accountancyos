## Audit Of Every Step In "Approve & Create Client"

When the approval RPC runs, the `onboarding_applications` row is UPDATEd to `status='approved'`. That fires five triggers, plus the RPC body inserts into several tables. I checked every column, every CHECK constraint, every status-transition trigger, and every nested function call against the live schema.

### 1. Trigger: `notify_onboarding_approved` — BROKEN (current error)
Reads `organizations.custom_domain`. That column does not exist on the `organizations` table (verified via `information_schema.columns`). This is what aborts the transaction with `column "custom_domain" does not exist`.
**Fix:** rewrite the trigger to drop the lookup and hard-code `https://client.accountancyos.com` (same URL `lifecycle_grant_portal_access` already uses).

### 2. Trigger: `auto_verify_aml_on_approval` — OK
Already corrected in the last migration. Sets `aml_status='verified'`, which matches the `onboarding_applications_aml_status_check` CHECK (`pending|verified|failed|manual_review`).

### 3. Trigger: `link_onboarding_documents_on_approval` — OK
Updates `onboarding_documents.client_id` / `company_id`. Both columns exist.

### 4. Trigger: `notify_onboarding_for_review` — OK
Only fires when status transitions to `for_review`, not `approved`. Not on this path.

### 5. Trigger: `tg_onboarding_status_audit` — OK
Inserts into `onboarding_events` with required columns; all present.

### 6. RPC body — `lifecycle_approve_onboarding`

| Step | Table | Verified against live schema |
|------|-------|------------------------------|
| Update / Insert `clients` | clients | All referenced columns exist (`utr`, `aml_verified_by`, `aml_expiry_date`, etc.). `status='active'` matches `clients_status_check` |
| Update / Insert `companies` | companies | All columns exist. `status='active'` matches `companies_status_check` |
| Insert `engagements` | engagements | `frequency` ∈ {monthly, one_off} matches `engagements_frequency_check`. `status='active'` matches `engagements_status_check`. `client_id OR company_id` satisfies `engagements_check` |
| Insert `jobs` | jobs | `status='blank'` matches `chk_jobs_status`. `priority='normal'` matches `jobs_priority_check`. `automation_source='template'` matches `jobs_automation_source_check`. `job_status_transition_check` trigger is BEFORE UPDATE only, so insert with `blank` is allowed |
| Insert `email_queue` | email_queue | `status='pending'` ✓, `context` left NULL (CHECK allows NULL) ✓, `provider` left NULL ✓ |
| Insert `client_tasks` | client_tasks | `status='not_started'` matches `client_tasks_status_check`. `visibility='client_visible'` matches `client_tasks_visibility_check`. `client_or_company_required` CHECK satisfied (only one of v_client_id / v_company_id is set in each path) |
| Insert `audit_log` | audit_log | columns present |
| Update `onboarding_applications` | columns `approved_at`, `approved_by`, `aml_expiry_date`, `aml_documents_migrated`, `status` all exist; `status='approved'` matches CHECK |

### 7. Nested call: `lifecycle_grant_portal_access` — OK
- Insert `portal_access`: `status='invited'` ✓, `client_id XOR company_id` ✓.
- Insert `email_queue`: `status='pending'` ✓, context NULL ✓.
- Insert `audit_log`: ✓.
- This call is wrapped in `BEGIN/EXCEPTION WHEN OTHERS` in the RPC, so even a failure here would not abort approval (it would only log).

### 8. Notifications insert (inside `notify_onboarding_approved`, after fix)
`type='onboarding_approved'` — `notifications.type` has no CHECK constraint.
`entity_type='onboarding'` matches `notifications_entity_type_check` (which already lists `'onboarding'`).

## Conclusion

After fixing trigger #1, every column reference, every CHECK constraint, and every transition rule along the full approval path validates against the live schema. No other latent failures detected.

## Migration

Single trigger replacement — body identical to the current version except the `v_portal_url` lookup is removed and replaced with the canonical client portal URL.

## Post-Migration Verification

1. Re-run the live `pg_proc` scan for any other function bodies referencing nonexistent columns (`custom_domain`, `engagement_id` on jobs, AML `passed`, etc.) to confirm none remain.
2. Click **Approve & Create Client** in the preview; confirm no error toast, and that:
   - `onboarding_applications.status = 'approved'`
   - a `clients` or `companies` row is active
   - rows appear in `engagements`, `jobs`, `portal_access`, `email_queue` (welcome + portal invite), `notifications`.
3. Report back only after those rows are observed.



# Full Verification Audit — Concrete Evidence Per Item

---

## 1. Role Model

### DB Constraint (VERIFIED)
```sql
-- organization_users_role_check
CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))
```
This constraint exists on `organization_users` and is enforced at the DB level.

### DB Hierarchy Functions (VERIFIED)
```sql
-- role_level(r text) → integer
CASE r WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'staff' THEN 1 ELSE 0 END;

-- user_role_is_at_least(check_user_id uuid, check_org_id uuid, min_role text)
-- SECURITY DEFINER, checks role_level(role) >= role_level(min_role)
```

### References to `manager` / `viewer` — PARTIALLY COMPLETE
**Code:** No functional references to `manager` or `viewer` as role assignments exist in application code. The word "manager" appears only in non-role contexts:
- `DisclosureManager` (component name)
- `RecordsRequestManager` (component name)
- `assigneeRole: "manager"` in job template tasks (task assignment role, not org role)
- `manager_approval` in `e2e-flow-validation.ts` filing state machine (filing review concept, not org role)

**DATABASE ISSUE — NOT FULLY RESOLVED:**
```
app_role enum still contains: owner, admin, manager, staff, viewer
```
The CHECK constraint on `organization_users` restricts to 3 roles, but the **Postgres enum `app_role`** still carries 5 values. The auto-generated `types.ts` reflects this: `app_role: "owner" | "admin" | "manager" | "staff" | "viewer"`. The enum values `manager` and `viewer` are dead but not removed from the DB enum. **This is a gap.**

### Full Permission Matrix (VERIFIED — `src/lib/permissions.ts`)

| Permission | owner | admin | staff |
|---|---|---|---|
| can_manage_practice_settings | ✓ | ✓ | ✗ |
| can_manage_billing | ✓ | ✗ | ✗ |
| can_manage_team | ✓ | ✓ | ✗ |
| can_manage_automation_rules | ✓ | ✓ | ✗ |
| can_view_automation_history | ✓ | ✓ | ✓ |
| can_view_all_jobs | ✓ | ✓ | ✓ |
| can_create_jobs | ✓ | ✓ | ✓ |
| can_manage_templates | ✓ | ✓ | ✗ |
| can_finalize_workpapers | ✓ | ✓ | ✗ |
| can_approve_filings | ✓ | ✓ | ✗ |
| can_submit_filings | ✓ | ✓ | ✗ |
| can_view_sensitive_data | ✓ | ✓ | ✗ |
| can_delete_records | ✓ | ✓ | ✗ |
| can_send_emails | ✓ | ✓ | ✓ |
| can_void_paid_invoices | ✓ | ✗ | ✗ |
| can_override_locked_records | ✓ | ✗ | ✗ |

(Full 36-permission matrix in `src/lib/permissions.ts` lines 59-118)

### Server-side permission enforcement (edge functions — `supabase/functions/_shared/permissions.ts`)
Separate 3-role model with granular `Permission` type (org.read, billing.admin, filings.approve, etc.) enforced via `requireOrgContext()` with `permission` option in `_shared/auth.ts`.

### RLS Policies on `organization_users` (VERIFIED)
```sql
-- SELECT: Users can view org members
USING (user_in_organization(auth.uid(), organization_id))

-- INSERT: Block direct inserts - use RPCs
WITH CHECK (false)

-- UPDATE: Owners can update member roles
USING/WITH CHECK (user_has_org_role(auth.uid(), organization_id, 'owner'))

-- DELETE: Owners can remove members or self-leave
USING ((user_id = auth.uid()) OR user_has_org_role(auth.uid(), organization_id, 'owner'))
```

### Test Evidence
- **Staff cannot access admin/owner-only actions:** Client-side enforced via `usePermission()` hook; server-side enforced via `requireOrgContext({ permission: 'filings.approve' })` in edge functions.
- **Admin has LESS access than owner:** `can_manage_billing`, `can_void_paid_invoices`, `can_override_locked_records` are owner-only. Confirmed in code and edge function permission map.
- **No fallback/implicit permissions:** `roleHasPermission()` returns `false` for `null`/undefined roles. No default grants.

### FLAGGED ISSUE
> The `app_role` Postgres enum still contains `manager` and `viewer`. A migration is needed to remove them: `ALTER TYPE app_role RENAME VALUE ...` is not supported; requires creating a new enum. Since only the CHECK constraint governs actual usage, this is cosmetic but should be cleaned up.

---

## 2. organization_users Security

### INSERT RLS Policy (VERIFIED)
```sql
-- Policy: "Block direct inserts - use RPCs"
-- Command: INSERT
-- WITH CHECK: false
```
**Direct inserts are impossible.** All membership creation goes through:

### Membership Restricted To (VERIFIED):

**1. Owner adding users — `add_org_member()` SECURITY DEFINER:**
```sql
-- Validates: target_role IN ('admin', 'staff') only
-- Validates: caller is 'owner' of target org
-- Prevents duplicates
-- Logs to audit_log
```

**2. Invitation acceptance — `accept_org_invitation()` SECURITY DEFINER:**
```sql
-- Validates: invitation status = 'pending'
-- Validates: auth.uid() email matches invitation email
-- Prevents duplicate membership
-- Marks invitation as accepted
```

### Test Evidence
- **Non-member cannot insert:** INSERT policy `WITH CHECK (false)` — any direct insert fails.
- **Staff cannot add users:** `add_org_member()` checks `caller_role != 'owner'` → raises exception.
- **Staff cannot escalate role:** `add_org_member()` only allows `'admin'` or `'staff'`. UPDATE policy requires owner role.
- **Cross-org access impossible:** `user_has_org_role()` is `SECURITY DEFINER` and always scopes to `organization_id`. SELECT uses `user_in_organization()`.

---

## 3. CRM Conversion Flow

### Conversion Trigger (VERIFIED — `src/components/crm/LeadDetailPanel.tsx` line 117)
Conversion is triggered by a manual button click calling `handleConvertToClient()` → `convertLeadToClient()`.

### FLAGGED — DOES NOT MATCH SPEC
**Current behaviour:** Conversion is a manual button press from the lead detail panel. It does NOT require engagement letter signing. It does NOT wait for "Won" stage.

**Memory says:** "Leads automatically convert to 'Won' status and a Client record is created only when the prospect signs the engagement letter."

**Actual code (`src/lib/lead-conversion-service.ts`):**
- No check for engagement letter status
- No check for lead stage/status
- No idempotency guard (no check for `converted_at` or existing client with matching email)
- Simply creates client/company and sets `converted_at` on the lead

### Test Evidence
- **Move to Won without EL → no client created:** NOT ENFORCED. Any lead can be converted regardless of stage or EL status.
- **Sign EL → client created:** NOT IMPLEMENTED. No trigger from engagement letter signing to conversion.

**This is a gap. The conversion flow does not match the documented specification.**

---

## 4. Job Status System

### Current Status List (DB trigger `validate_job_status_transition`):
```
not_started, in_progress, waiting_on_client, records_received, 
client_queries, blank, in_review, on_hold, completed, cancelled
```

### Default Status: `'not_started'::text` (column default on `jobs.status`)

### Valid Transitions (DB-enforced trigger):
```json
{
  "not_started": ["in_progress", "on_hold", "cancelled"],
  "in_progress": ["waiting_on_client", "in_review", "on_hold", "cancelled", "records_received", "client_queries", "blank"],
  "records_received": ["in_progress", "client_queries", "waiting_on_client", "in_review", "on_hold"],
  "client_queries": ["records_received", "in_progress", "waiting_on_client", "on_hold"],
  "blank": ["in_progress", "not_started"],
  "waiting_on_client": ["in_progress", "records_received", "on_hold", "cancelled"],
  "in_review": ["completed", "in_progress", "on_hold"],
  "on_hold": ["in_progress", "not_started", "cancelled"],
  "completed": ["in_progress"],
  "cancelled": ["not_started"]
}
```

### FLAGGED — MISMATCH WITH DOCUMENTED LIFECYCLE
The memory states the canonical list is: `Blank, Records Requested, Records Received, Accountant Queries, Client Queries, Accountant Review, Client Review, Ready to File, Completed`.

**The DB trigger uses different statuses:** `not_started, in_progress, waiting_on_client, in_review, on_hold, cancelled` instead of the documented `Records Requested, Accountant Queries, Accountant Review, Client Review, Ready to File`.

Meanwhile, `src/lib/job-status-service.ts` defines a DIFFERENT list:
```typescript
"blank" | "records_requested" | "records_received" | "accountant_queries" | 
"client_queries" | "accountant_review" | "client_review" | "ready_to_file" | "completed"
```

**The DB trigger and the TypeScript service are out of sync.** The trigger allows `not_started`, `in_progress`, `in_review`, `on_hold`, `cancelled` which don't exist in the TS enum, and the TS service references `records_requested`, `accountant_queries`, `accountant_review`, `client_review`, `ready_to_file` which the trigger doesn't know about.

### Automation/Filing Impact
- Automations use `emitJobStatusChange()` which passes whatever status string is used — no hard coupling to specific values.
- Filings have their own independent status trigger (`validate_filing_status_transition`) which is correctly implemented.
- UI: `DashboardKPICards` and job pages query by `status` — they would work with whatever values are in the DB, but mismatch could cause silent failures.

**This is a significant gap requiring reconciliation.**

---

## 5. Revenue Dashboard

### Data Source (VERIFIED — `src/components/dashboard/FeeAggregationPanel.tsx`)

**Monthly Recurring Revenue:**
```typescript
// Query: engagements table joined with services_catalog
// freq === "monthly" → monthly += fee
// freq === "quarterly" → monthly += fee / 3
```

**One-Off Revenue:**
```typescript
// freq === "fixed" | "annually" | other → oneOff += fee
```

**Fee Resolution:**
```typescript
const fee = config?.fee_amount ?? config?.price ?? service?.default_price ?? 0;
```
Uses `service_config` JSONB override, falls back to `services_catalog.default_price`.

**Annualised Total:** `monthly * 12 + oneOff`

**Lead Pipeline Value:** Not shown in FeeAggregationPanel. Shown in `DashboardKPICards` which queries `leads` table with `estimated_monthly_value`.

### FLAGGED
- Revenue breakdown is correct for active engagements.
- No historical trending (no month-over-month comparison).
- Lead pipeline value is a simple sum of `estimated_monthly_value` from leads — no weighted pipeline.

---

## 6. HMRC Authorisation

### UI Location (VERIFIED)
- **Component:** `src/components/clients/HmrcAuthorisationPanel.tsx`
- **Route:** Rendered inside `src/pages/ClientPortal.tsx` on the Overview tab (line 133)

### DB Table: `hmrc_authorisations` (VERIFIED)
Columns: `id, organization_id, client_id, company_id, auth_type, authorised_at, expires_at, status, reference, notes, created_at, updated_at`

### Status Lifecycle (VERIFIED in component):
- `pending` → Badge: "Pending"
- `active` (not expired) → Badge: "Active" (green)
- `active` (expiring within 30 days) → Badge: "Expiring Soon" (yellow)
- `active` (past expiry) → Badge: "Expired" (red)
- `expired` → Badge: "Expired"
- `revoked` → Badge: "Revoked"

### FLAGGED — Blocking Behaviour
**Not implemented.** There is no code that checks `hmrc_authorisations` status before allowing job/filing work. The panel is informational only. The spec says: "Visibility of auth status is integrated into relevant jobs and filings to prevent compliance-blocked work." This is NOT enforced.

---

## 7. Deadlines

### Implementation (VERIFIED — `src/lib/deadline-engine.ts`, 990 lines)
Supports: CS01, SA (Paper/Online/POA2), CT, VAT, RTI (Payroll), CIS.

### FLAGGED — CGT 60-Day Rule
**Not implemented.** No code references CGT 60-day deadlines. No `service_code` for CGT deadlines in the engine. The `client_detail_cgt` table exists but no deadline generation logic references it.

### FLAGGED — Charity Deadlines
**Not implemented.** No charity-specific deadline logic exists. The `client_detail_charity` table exists but the deadline engine has no charity code path.

### Deadline-to-Automation Link (VERIFIED)
```typescript
// deadline-engine.ts imports and calls:
import { emitDeadlineApproaching } from "./automation-triggers";
```
Deadlines can trigger automation events when approaching due dates.

---

## 8. Session Security

### Client-Side Idle Timeout (VERIFIED)
- **File:** `src/hooks/useInactivityTimeout.ts`
- **Timeout:** 10 minutes (`INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000`)
- **Events monitored:** `mousedown, keydown, touchstart, scroll, mousemove`
- **Behaviour:** Calls `signOut()` on timeout. Handles tab visibility (checks elapsed time on tab return).
- **Integration:** Used in `src/lib/auth-context.tsx` line 271.

### Server-Side Session Cleanup (VERIFIED)
- **Edge function:** `supabase/functions/session-cleanup/index.ts`
- **Reads:** `org_settings.session_timeout_minutes` (default 480 minutes / 8 hours)
- **Deletes expired sessions** from `user_sessions` table.

### Session Audit Fields (VERIFIED — `user_sessions` table)
```
id, user_id, organization_id, session_token, device_info (jsonb), 
ip_address, user_agent, created_at, last_activity_at, expires_at, 
invalidated_at, invalidated_reason
```

### FLAGGED — Concurrent Session Enforcement
**Not implemented.** No code found that limits concurrent sessions per user or per subscription tier. The memory spec says "Solo: 1, Studio: 4, Firm: 10" but there is no enforcement logic — neither in the session-cleanup function, nor in auth-context, nor in any edge function.

---

## 9. Services & Engagement Logic

### FLAGGED — NOT IMPLEMENTED
No code exists that:
- Detects fee changes and triggers a new engagement letter
- Detects service additions and triggers a new engagement letter
- Links `engagements` table mutations to `engagement_letters` table creation

The `engagement_letters` table exists with columns: `id, organization_id, onboarding_application_id, template_id, document_content, sent_at, viewed_at, signed_at, signature_ip, signature_user_agent, signature_token, token_expires_at`.

But there is no trigger, webhook, or application code that watches for fee/service changes and generates a new letter.

---

## 10. Documents

### `client_visible` Toggle (VERIFIED)
- **DB column:** `job_documents.client_visible` (boolean, nullable)
- **UI toggle:** `src/components/client-portal/ClientDocumentsTab.tsx` line 136-139
- **Mutation:** `supabase.from("job_documents").update({ client_visible: visible }).in("id", docIds)`

### `signature_required` Toggle (VERIFIED)
- **DB column:** `job_documents.signature_required` (boolean, nullable)
- **UI toggle:** `ClientDocumentsTab.tsx` line 155-158
- **Mutation:** `supabase.from("job_documents").update({ signature_required: required }).in("id", docIds)`

### Signed Document Storage (VERIFIED)
- **DB columns:** `signed_at, signed_by, signature_ip, signature_typed_name, scroll_verified`
- **Compliance:** `auto_archive_at` (date), `archived` (boolean), `archived_at` (timestamp)
- **Version tracking:** `version` (integer) column exists

### FLAGGED — Bulk Delete
**Not implemented.** No bulk delete functionality found in `ClientDocumentsTab.tsx` or any document component. Individual document operations exist but no multi-select delete.

### FLAGGED — Signed Document as New File/Version
The DB has a `version` column, but no code was found that creates a new file version upon signing. The signing process updates the existing record's `signed_at`, `signed_by`, etc. fields in place — it does not create a versioned copy.

### Audit Trail Fields (VERIFIED)
`uploaded_by, uploaded_at, signed_at, signed_by, signature_ip, signature_typed_name, scroll_verified` — all populated by the document service (`src/lib/document-service.ts`).

---

## Summary of Gaps

| Item | Status | Gap |
|------|--------|-----|
| 1. Role Model | 95% | `app_role` enum still has `manager`/`viewer` |
| 2. org_users Security | 100% | Fully locked down |
| 3. CRM Conversion | 30% | No EL-gated conversion, no idempotency |
| 4. Job Status | 50% | DB trigger and TS service have different status lists |
| 5. Revenue Dashboard | 85% | No trending, no weighted pipeline |
| 6. HMRC Auth | 70% | Informational only, no blocking logic |
| 7. Deadlines | 70% | No CGT 60-day, no charity deadlines |
| 8. Session Security | 70% | No concurrent session enforcement |
| 9. Service/Engagement | 0% | No fee/service change → EL trigger |
| 10. Documents | 75% | No bulk delete, no versioned signed copy |


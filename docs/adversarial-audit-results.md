# AccountancyOS Adversarial Audit — Failure Report

**Date:** 2026-02-18  
**Auditor Role:** Principal QA + Staff Backend + Product Security Lead  
**Method:** Systematic adversarial testing of RLS policies, schema constraints, data integrity, and workflow logic  
**Result:** **17 confirmed failures** identified, multiple critical severity

---

## 🔴 FAILURE LOG

---

### FAILURE 1: Any Authenticated User Can Join Any Organization (CRITICAL — SECURITY)

**Reproduction:**
1. Authenticate as any user (e.g. sign up a new account)
2. Look up any `organizations.id` (visible to any authenticated user)
3. Execute: `supabase.from('organization_users').insert({ user_id: auth.uid(), organization_id: '<target_org_id>', role: 'staff' })`

**Expected:** Rejected — user should only join via invitation or during org creation  
**Actual:** Succeeds. Two PERMISSIVE INSERT policies allow this:
- `Users can create their own membership` — `WITH CHECK (user_id = auth.uid())`
- `Users can insert organization membership` — `WITH CHECK (user_id = auth.uid())`

Neither policy validates that an invitation exists, that the org is the user's own, or that the user was invited. The only check is `user_id = auth.uid()`.

**Root Cause:** Missing RLS constraint on `organization_users` INSERT that requires either (a) user is creating their own org during signup, OR (b) a valid `team_invitations` record exists.  
**Severity:** 🔴 **CRITICAL** — Complete tenant isolation bypass. Any user can access any practice's clients, filings, financials, AML data, and bank feeds.

---

### FAILURE 2: Role Constraint Blocks 'manager' and 'viewer' Roles (CRITICAL — FUNCTIONALITY)

**Reproduction:**
1. Attempt: `supabase.from('organization_users').insert({ user_id: '...', organization_id: '...', role: 'manager' })`
2. Or attempt: `UPDATE organization_users SET role = 'viewer' WHERE ...`

**Expected:** Succeeds — the permission system defines 5 roles: owner, admin, manager, staff, viewer  
**Actual:** Fails with constraint violation. `organization_users_role_check` only allows `['owner', 'admin', 'staff']`.

**Root Cause:** `CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))` — the constraint was never updated when `manager` and `viewer` roles were added to the permissions system.  
**Impact:** The entire frontend permission system for `manager` and `viewer` roles is **dead code**. `usePermission('can_finalize_workpapers')` will never return true for a manager because no user can have `role='manager'` in the database. All permission checks that rely on `roleHasPermission` for manager/viewer permissions are non-functional.  
**Severity:** 🔴 **CRITICAL** — Two of five role tiers cannot be assigned. The permission matrix is a fiction.

---

### FAILURE 3: Journals RLS Has Conflicting Policies That Cancel Out (HIGH — SECURITY)

**Reproduction:**
1. Authenticate as any org member (any role)
2. Execute: `supabase.from('journals').insert({ organization_id: '<my_org>', ... })`

**Expected:** Blocked by `journals_no_direct_insert` (WITH CHECK: false)  
**Actual:** **Succeeds** because PostgreSQL PERMISSIVE policies use OR logic. The `Users can manage journals in their organization` policy (cmd=ALL, qual=`user_has_organization_access`) matches INSERT, and since ANY PERMISSIVE policy passing allows access, the `false` policy is irrelevant.

**Root Cause:** `journals_no_direct_insert` is PERMISSIVE, not RESTRICTIVE. In PostgreSQL, PERMISSIVE policies are OR'd together — if ANY one passes, access is granted. The intent was to force inserts through RPCs only, but the ALL policy overrides it entirely.  
**Impact:** Any org member (including viewers) can directly create/update/delete journals, bypassing the posting service's balance validation, period lock checks, and audit trail.  
**Severity:** 🔴 **HIGH** — Ledger integrity bypass. Unbalanced entries, locked period violations, audit trail circumvention.

---

### FAILURE 4: Filing Artefacts (iXBRL/XML) Can Be Modified After Creation (HIGH — COMPLIANCE)

**Reproduction:**
1. Authenticate as any org member
2. Execute: `supabase.from('filing_artefacts').update({ content: '<malicious_ixbrl>' }).eq('id', '<artefact_id>')`

**Expected:** Filing artefacts should be immutable after generation  
**Actual:** Succeeds. The `Users can manage filing artefacts in their organization` policy (cmd=ALL) allows UPDATE and DELETE.

**Root Cause:** ALL policy with no immutability guard. Compare with `filing_model_snapshots` which correctly has `Snapshots are immutable - no updates/deletes` (qual: false).  
**Impact:** Submitted iXBRL documents and CT600 XML can be retroactively modified, breaking the audit trail and creating compliance risk with HMRC/Companies House.  
**Severity:** 🔴 **HIGH** — Tax filing integrity compromise.

---

### FAILURE 5: Engagement Letters Can Be Forged by Any Org Member (HIGH — COMPLIANCE)

**Reproduction:**
1. Authenticate as any org member (including staff/viewer)
2. Execute: `supabase.from('engagement_letters').update({ signed_at: '2026-01-01', signature_data: '{"forged": true}', status: 'signed' }).eq('id', '<letter_id>')`

**Expected:** Only the client (via token link) should be able to sign. Org members should not be able to fabricate signatures.  
**Actual:** Succeeds. The `org_users_can_manage_engagement_letters` policy (cmd=ALL) allows any org member to update any field including signature data.

**Root Cause:** No column-level restriction on signature fields. The policy grants full CRUD to all org members.  
**Impact:** Staff can forge client signatures on engagement letters. Regulatory and legal risk.  
**Severity:** 🔴 **HIGH** — E-signature forgery.

---

### FAILURE 6: Filings Can Be Directly Updated to 'accepted' Without Submission (HIGH — COMPLIANCE)

**Reproduction:**
1. Authenticate as any org member
2. Execute: `supabase.from('filings').update({ status: 'accepted', filed_at: now(), filing_receipt: 'FAKE-RECEIPT' }).eq('id', '<filing_id>')`

**Expected:** Status should only change to 'accepted' via HMRC/CH API response processed by edge functions  
**Actual:** Succeeds. The `Users can update filings in their organization` policy allows unrestricted updates.

**Root Cause:** No status transition validation in RLS or database triggers. Status is a free-text field with no constraints.  
**Impact:** A user can mark a filing as accepted/submitted without actually submitting to HMRC. This creates false compliance records.  
**Severity:** 🔴 **HIGH** — False filing status. Practice believes filing was accepted when it was never submitted.

---

### FAILURE 7: No UPDATE/DELETE Policies on organization_users (MEDIUM — SECURITY)

**Reproduction:**
1. Authenticate as owner
2. Attempt: `supabase.from('organization_users').update({ role: 'staff' }).eq('user_id', '<target>')`
3. Or: `supabase.from('organization_users').delete().eq('user_id', '<target>')`

**Expected:** Owner/admin can manage team member roles and remove members  
**Actual:** Silently fails (0 rows affected). No UPDATE or DELETE policies exist on `organization_users`.

**Root Cause:** RLS policies only define SELECT and INSERT. `update_user_role_safe` RPC exists as SECURITY DEFINER but direct client-side operations are impossible.  
**Impact:** If the RPC fails or the frontend uses direct queries, role changes silently fail. Also means a compromised staff account cannot be removed via the client SDK — only via service role.  
**Severity:** 🟡 **MEDIUM** — Operational risk. Team management depends entirely on RPCs working.

---

### FAILURE 8: Audit Log Entries Can Be Fabricated (MEDIUM — COMPLIANCE)

**Reproduction:**
1. Authenticate as any org member (including viewer)
2. Execute: `supabase.from('audit_log').insert({ organization_id: '<my_org>', action: 'filing_submitted', entity_type: 'filing', entity_id: '<any_id>', user_id: '<any_user_id>', actor_role: 'owner' })`

**Expected:** Audit entries should only be created by system processes (RPCs, triggers)  
**Actual:** Succeeds. The `org_users_can_insert_audit_log` policy allows any org member to insert audit entries with arbitrary content, including spoofing `user_id` and `actor_role`.

**Root Cause:** No validation that `user_id = auth.uid()` on audit log inserts. No restriction to RPC context.  
**Impact:** Audit trail can be poisoned with fake entries. Cannot distinguish real actions from fabricated ones.  
**Severity:** 🟡 **MEDIUM** — Audit trail unreliable.

---

### FAILURE 9: Ledger Entries Disconnected from Journals (MEDIUM — DATA INTEGRITY)

**Reproduction:**
1. Examine `ledger_entries` schema — no `journal_id` column exists
2. Delete a journal: `supabase.from('journals').delete().eq('id', '<id>')`
3. Ledger entries from that journal remain, with no reference back

**Expected:** Ledger entries should reference their source journal for traceability  
**Actual:** `ledger_entries` has `source_type` and `source_id` but no FK constraint. Source could be 'invoice', 'bill', 'journal', etc. — there's no guarantee the source still exists.

**Root Cause:** Design decision to use generic `source_type`/`source_id` instead of typed FKs. No cascade delete or orphan prevention.  
**Impact:** Deleting source records (journals, invoices, bills) creates orphaned ledger entries that contribute to trial balance but have no provenance. Cannot reconstruct the audit trail.  
**Severity:** 🟡 **MEDIUM** — Data integrity, audit trail gaps.

---

### FAILURE 10: filing_model_snapshots Has Conflicting Insert Policies (MEDIUM — FUNCTIONALITY)

**Reproduction:**
1. Attempt: `supabase.from('filing_model_snapshots').insert({ ... })`

**Expected:** Insert succeeds for org members (as `Users can insert snapshots for their org` suggests)  
**Actual:** Depends on PostgreSQL evaluation order. `filing_model_snapshots_no_direct_insert` (WITH CHECK: false) vs `Users can insert snapshots for their org` (WITH CHECK: org check). Since both are PERMISSIVE, the org-check policy **wins** (OR logic), making the no_direct_insert policy dead code.

**Root Cause:** Same issue as Failure 3. PERMISSIVE policies with `false` are no-ops when another PERMISSIVE policy exists.  
**Impact:** Snapshots intended to be created only via controlled processes can be directly inserted by any org member. However, the immutability policies (no update/delete) are correctly PERMISSIVE with `false` AND no competing policies, so they DO work.  
**Severity:** 🟡 **MEDIUM** — Bypass of controlled snapshot creation.

---

### FAILURE 11: pending_practice_signups Readable by All Authenticated Users (LOW — PRIVACY)

**Reproduction:**
1. Authenticate as any user
2. Execute: `supabase.from('pending_practice_signups').select('*')`

**Expected:** Only the relevant accountant/client should see signup records  
**Actual:** All authenticated users can read all records (policy: `Anyone can view pending signups by email`, qual: `true`).

**Root Cause:** Intentional design for email-based lookup, but exposes accountant emails, practice names, and client references to any authenticated user.  
**Severity:** 🟢 **LOW** — Information disclosure.

---

### FAILURE 12: api_rate_limits Has RLS Enabled But No Policies (LOW — SECURITY)

**Reproduction:**
1. Authenticate as any user
2. Execute: `supabase.from('api_rate_limits').select('*')`

**Expected:** Either accessible or properly restricted  
**Actual:** RLS is enabled but no policies exist. This means **all operations are denied** for all roles (PostgreSQL default when RLS is on with no policies).

**Root Cause:** Table created with RLS enabled but no policies added.  
**Impact:** Rate limit records cannot be read/written via the client SDK. Only service role can access. If rate limiting is implemented client-side, it's broken.  
**Severity:** 🟢 **LOW** — Rate limiting may not function.

---

### FAILURE 13: Connected Mailbox OAuth Tokens Exposed to Users (MEDIUM — SECURITY)

**Reproduction:**
1. Authenticate as a user with a connected mailbox
2. Execute: `supabase.from('connected_mailboxes').select('access_token, refresh_token').eq('user_id', auth.uid())`

**Expected:** Tokens should never be readable from the client  
**Actual:** Succeeds. The SELECT policy is `user_id = auth.uid()`, returning ALL columns including `access_token` and `refresh_token`.

**Root Cause:** No column-level security. Tokens are in the same table as metadata (email address, display name) with no view to hide sensitive columns.  
**Impact:** A compromised frontend or XSS attack can exfiltrate Gmail/Outlook OAuth tokens, granting full email access.  
**Severity:** 🟡 **MEDIUM** — Token exposure via client SDK.

---

### FAILURE 14: Invoice Void Does Not Reverse Ledger Entries (HIGH — DATA INTEGRITY)

**Reproduction:**
1. Create and post an invoice (generates ledger entries: DR Debtors, CR Sales, CR VAT)
2. Void the invoice
3. Query ledger entries — original posting entries still exist

**Expected:** Voiding a posted invoice should create reversing journal entries  
**Actual:** `invoice-service.ts` comments: "If posted, we should post reversing entries. For now, just mark as voided." Ledger entries remain, permanently inflating revenue and debtors.

**Root Cause:** Incomplete implementation. The void function only updates `invoices.status` without touching the ledger.  
**Impact:** Trial balance and VAT returns include revenue from voided invoices. Financial statements are incorrect.  
**Severity:** 🔴 **HIGH** — Financial misstatement.

---

### FAILURE 15: Approval Revocation Log Is Append-Only But Has No INSERT Policy (MEDIUM)

**Reproduction:**
1. Authenticate as any org member
2. Execute: `supabase.from('approval_revocation_log').insert({ ... })`

**Expected:** Either insertable by system processes or blocked  
**Actual:** Only a SELECT policy exists. No INSERT policy → inserts are blocked for all client roles. Revocations can only be recorded by service role or SECURITY DEFINER functions.

**Root Cause:** By design (good), but if the triggering process doesn't use service role, revocations fail silently.  
**Impact:** If approval revocation is triggered from client-side code, it silently fails, leaving stale approvals on modified data.  
**Severity:** 🟡 **MEDIUM** — Silent failure risk.

---

### FAILURE 16: No Status Transition Validation on Jobs (MEDIUM — WORKFLOW)

**Reproduction:**
1. Execute: `supabase.from('jobs').update({ status: 'completed' }).eq('id', '<job_in_not_started>')`

**Expected:** Jobs should follow the defined status progression  
**Actual:** Succeeds. No database constraint or trigger validates status transitions.

**Root Cause:** Status validation exists only in frontend service code (`job-status-service.ts`), not enforced at the database level.  
**Impact:** Direct database updates can skip workflow steps, bypass required reviews, and trigger premature auto-rollover.  
**Severity:** 🟡 **MEDIUM** — Workflow bypass.

---

### FAILURE 17: Posting Service Non-Atomic Ledger Writes (HIGH — DATA INTEGRITY)

**Reproduction:**
1. Call `postToLedger()` with valid data
2. Simulate failure after journal insert but before ledger_entries insert (e.g., network timeout)
3. Orphaned journal exists with no ledger entries

**Expected:** Either all three writes succeed (journal + journal_lines + ledger_entries) or none do  
**Actual:** Three separate INSERT calls with manual rollback on failure. Rollback is best-effort (delete calls that can themselves fail).

**Root Cause:** Supabase JS client doesn't support multi-statement transactions. The posting service uses sequential inserts with try/catch rollback.  
**Impact:** Partial ledger state — journal exists but ledger entries don't, or vice versa. Trial balance becomes unreliable.  
**Severity:** 🔴 **HIGH** — Silent data corruption.

---

## INVARIANT VIOLATIONS

| # | Invariant | Status | Evidence |
|---|---|---|---|
| 1 | Only invited users can join organizations | ❌ **FAILS** | Failure 1 |
| 2 | All 5 defined roles (owner/admin/manager/staff/viewer) can be assigned | ❌ **FAILS** | Failure 2 |
| 3 | Journals can only be created via posting service | ❌ **FAILS** | Failure 3 |
| 4 | Filing artefacts are immutable after creation | ❌ **FAILS** | Failure 4 |
| 5 | Engagement letters can only be signed by clients | ❌ **FAILS** | Failure 5 |
| 6 | Filing status changes only via controlled processes | ❌ **FAILS** | Failure 6 |
| 7 | Audit log entries are trustworthy | ❌ **FAILS** | Failure 8 |
| 8 | Voiding an invoice reverses ledger impact | ❌ **FAILS** | Failure 14 |
| 9 | Ledger writes are atomic | ❌ **FAILS** | Failure 17 |
| 10 | Filing model snapshots are immutable | ✅ Passes (UPDATE/DELETE blocked) | But INSERT bypass exists (Failure 10) |
| 11 | OAuth tokens not readable from client | ❌ **FAILS** | Failure 13 |
| 12 | Job status follows defined progression | ❌ **FAILS** | Failure 16 |
| 13 | Clients cannot access other clients' data | ✅ Passes | portal_access RLS correctly scoped |
| 14 | Cross-org data isolated | ⚠️ **FAILS IF** Failure 1 is exploited | org_users breach breaks all isolation |

### Invariants Unprovable with Current Architecture

- **Ledger = sum of all posted journals:** Cannot prove because ledger_entries have no FK to journals
- **Filing derives only from approved snapshots:** Snapshot INSERT is not restricted, so fake snapshots can be injected
- **Automation idempotency:** Unique constraint exists but nullable columns (client_id, company_id) may allow duplicates in PostgreSQL (NULL ≠ NULL)

---

## HARDENING PLAN

### Priority 1: Fix organization_users (Failures 1, 2, 7)

```sql
-- 1a. Fix role constraint to include all 5 roles
ALTER TABLE organization_users DROP CONSTRAINT organization_users_role_check;
ALTER TABLE organization_users ADD CONSTRAINT organization_users_role_check 
  CHECK (role = ANY (ARRAY['owner','admin','manager','staff','viewer']));

-- 1b. Restrict self-insert to only during org creation (no existing org_users for this org)
DROP POLICY "Users can create their own membership" ON organization_users;
DROP POLICY "Users can insert organization membership" ON organization_users;
CREATE POLICY "Users can create membership only for new orgs" ON organization_users
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    AND NOT EXISTS (
      SELECT 1 FROM organization_users WHERE organization_id = organization_users.organization_id
    )
  );

-- 1c. Add UPDATE/DELETE policies for owner/admin
CREATE POLICY "Owners and admins can update member roles" ON organization_users
  FOR UPDATE USING (
    user_has_org_role(auth.uid(), organization_id, 'owner') 
    OR user_has_org_role(auth.uid(), organization_id, 'admin')
  );
CREATE POLICY "Owners and admins can remove members" ON organization_users
  FOR DELETE USING (
    user_has_org_role(auth.uid(), organization_id, 'owner') 
    OR user_has_org_role(auth.uid(), organization_id, 'admin')
  );
```

### Priority 2: Fix Journals RLS (Failure 3)

```sql
-- Change no_direct_* to RESTRICTIVE so they actually block
DROP POLICY "journals_no_direct_insert" ON journals;
DROP POLICY "journals_no_direct_update" ON journals;
DROP POLICY "journals_no_direct_delete" ON journals;
-- Remove the overly-broad ALL policy
DROP POLICY "Users can manage journals in their organization" ON journals;
-- Keep only the role-scoped policies:
-- "Managers create journals" and "Admins update/delete journals" remain
```

### Priority 3: Make Filing Artefacts Immutable (Failure 4)

```sql
DROP POLICY "Users can manage filing artefacts in their organization" ON filing_artefacts;
CREATE POLICY "Users can view artefacts" ON filing_artefacts FOR SELECT 
  USING (user_in_organization(auth.uid(), organization_id));
CREATE POLICY "Users can create artefacts" ON filing_artefacts FOR INSERT 
  WITH CHECK (user_in_organization(auth.uid(), organization_id));
-- No UPDATE or DELETE policies = immutable
```

### Priority 4: Restrict Engagement Letter Signatures (Failure 5)

```sql
DROP POLICY "org_users_can_manage_engagement_letters" ON engagement_letters;
CREATE POLICY "Org users can view engagement letters" ON engagement_letters 
  FOR SELECT USING (user_has_organization_access(organization_id));
CREATE POLICY "Managers can create/update engagement letters" ON engagement_letters 
  FOR INSERT WITH CHECK (
    user_has_organization_access(organization_id) 
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager')
  );
CREATE POLICY "Managers can update non-signature fields" ON engagement_letters 
  FOR UPDATE USING (
    user_has_organization_access(organization_id) 
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager')
  );
-- Signature updates should only happen via SECURITY DEFINER RPC that validates the token
```

### Priority 5: Filing Status Transition Validation (Failure 6)

```sql
CREATE OR REPLACE FUNCTION validate_filing_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    RAISE EXCEPTION 'Cannot change status of accepted filing';
  END IF;
  IF NEW.status = 'accepted' AND OLD.status != 'submitted' THEN
    RAISE EXCEPTION 'Filing must be submitted before acceptance';
  END IF;
  IF NEW.status = 'submitted' AND OLD.status NOT IN ('ready_to_file', 'rejected') THEN
    RAISE EXCEPTION 'Filing must be ready_to_file before submission';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER filing_status_transition_check
  BEFORE UPDATE ON filings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_filing_status_transition();
```

### Priority 6: Audit Log Security (Failure 8)

```sql
DROP POLICY "org_users_can_insert_audit_log" ON audit_log;
-- Only allow inserts via RPC/triggers, not direct client inserts
-- Or at minimum, force user_id = auth.uid():
CREATE POLICY "System-only audit log inserts" ON audit_log
  FOR INSERT WITH CHECK (
    user_has_organization_access(organization_id)
    AND user_id = auth.uid()
  );
```

### Priority 7: Hide OAuth Tokens (Failure 13)

```sql
CREATE VIEW connected_mailboxes_safe 
WITH (security_invoker = on) AS
  SELECT id, organization_id, user_id, provider, email_address, 
         display_name, status, sync_state, last_synced_at, is_shared
  FROM connected_mailboxes;
-- Application code should query connected_mailboxes_safe, never the base table
```

### Priority 8: Invoice Void Reversal (Failure 14)

Implement reversing entries in `invoice-service.ts: voidInvoice()` — create a reversing journal (CR Debtors, DR Sales, DR VAT) using the existing `postToLedger()` function.

### Priority 9: Atomic Ledger Posting (Failure 17)

Move `postToLedger()` to a SECURITY DEFINER database function or edge function that uses a single SQL transaction with `BEGIN/COMMIT/ROLLBACK`.

---

## AUTOMATED TEST HARNESS (Proposed)

### 1. RLS Permission Fuzzing Suite

```typescript
// Test every table × every role × every operation (SELECT/INSERT/UPDATE/DELETE)
// For each combination, verify expected access matches actual access
const ROLES = ['owner', 'admin', 'manager', 'staff', 'viewer', 'unauthenticated'];
const TABLES = ['organizations', 'clients', 'filings', 'journals', ...all_tables];
const OPS = ['select', 'insert', 'update', 'delete'];

for (const role of ROLES) {
  for (const table of TABLES) {
    for (const op of OPS) {
      test(`${role} ${op} on ${table}`, async () => {
        const client = await getClientAsRole(role);
        const result = await client.from(table)[op](...testData);
        expect(result.error?.code).toBe(expectedAccess[role][table][op] ? undefined : '42501');
      });
    }
  }
}
```

### 2. Ledger Integrity Property Tests

```typescript
// Property: Sum of all ledger debits = sum of all ledger credits (per entity)
// Property: Every posted invoice has corresponding ledger entries
// Property: Voided invoices have net-zero ledger impact
// Property: No ledger entries exist for locked periods created after lock
```

### 3. Filing Pipeline Invariant Tests

```typescript
// Property: Every 'accepted' filing has a non-null snapshot with valid hash
// Property: Filing artefact content_hash matches actual content
// Property: No filing can reach 'accepted' without passing through 'submitted'
// Property: Snapshot data matches the filing draft_schedule_data_json at lock time
```

### 4. Workflow Simulation Runner

```typescript
// Randomly: emit triggers, skip steps, retry failed steps, inject duplicate events
// Verify: no duplicate instances, no skipped blocking steps, 
//         all email queues resolve, no infinite loops
```

---

*End of adversarial audit. 17 failures identified. 3 critical, 5 high, 6 medium, 3 low.*

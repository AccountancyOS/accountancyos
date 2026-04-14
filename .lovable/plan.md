

# AccountancyOS Production-Readiness Architecture Audit — Remediation Plan

The comprehensive audit has been completed and the full report was already delivered as `accountancyos-architecture-audit.md`. This plan summarises all findings and proposes the phased implementation.

---

## Executive Summary

**17 issues found:** 4 Critical, 5 High, 5 Medium, 3 Low

**Overall assessment:** Not production-ready. Strong architectural foundations (posting-service RPC, filing SSOT model, org-scoped storage) but critical "last mile" wiring failures across bills, email queue, notifications, and session enforcement.

**Top launch blockers:**
1. Bills/bill_lines/bill_payments — SELECT-only RLS, all writes fail
2. email_queue — SELECT-only RLS, all email sending fails
3. notifications — no INSERT policy, all notifications fail
4. Session enforcement — fully built but never called
5. Parallel bill creation code paths (bills-service vs bill-draft-service)

---

## Phase 1: Critical Launch Blockers (Migration + Code)

### 1A. Database Migration — Add Missing RLS Policies

Single migration to fix all SELECT-only tables where code performs writes:

```sql
-- bills: INSERT, UPDATE, DELETE (org-scoped)
CREATE POLICY "Org members can insert bills" ON public.bills
  FOR INSERT WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "Org members can update bills" ON public.bills
  FOR UPDATE USING (user_has_organization_access(organization_id));
CREATE POLICY "Org members can delete bills" ON public.bills
  FOR DELETE USING (user_has_organization_access(organization_id));

-- bill_lines: INSERT, UPDATE, DELETE
-- bill_payments: INSERT, UPDATE, DELETE
-- invoice_lines: INSERT, UPDATE, DELETE
-- invoice_payments: INSERT, UPDATE, DELETE
-- (all org-scoped via join to parent table)

-- email_queue: INSERT
CREATE POLICY "Org members can insert email queue" ON public.email_queue
  FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

-- notifications: INSERT
CREATE POLICY "Org members can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

-- Drop duplicate policies
DROP POLICY "View ledger entries" ON public.ledger_entries;
-- Drop duplicate user_saved_views policies (4 duplicates)
```

### 1B. Wire Session Enforcement

**File:** `src/contexts/auth-context.tsx` or equivalent auth handler
- Import and call `enforceSessionLimits(userId, orgId)` after successful `SIGNED_IN` events
- This is a 5-line code change

---

## Phase 2: Architectural Corrections (Code Refactoring)

### 2A. Eliminate Parallel Bill Creation Paths

- Refactor `BillEditorDialog.tsx` to use `bill-draft-service.ts` (which uses the safe RPC) instead of `bills-service.ts` direct inserts
- Deprecate `createDraftBill`/`updateDraftBill` from `bills-service.ts`

### 2B. Fix Payroll Ledger Posting

- Refactor `payrun-service.ts` to use `postToLedger()` from `posting-service.ts` instead of direct `ledger_entries` insert

### 2C. Add Org-Scoping to connected_mailboxes

- Update all 4 RLS policies to include `user_has_organization_access(organization_id)` in addition to `user_id = auth.uid()`

### 2D. Fix gmail_auth_states INSERT Policy

- Add `WITH CHECK (user_id = auth.uid())` to prevent users inserting auth states for other users

---

## Phase 3: Integration Hardening

### 3A. Companies House Sync — Environment-Driven Toggle

- Replace hardcoded mock data in `companies-house-sync/index.ts` with config check: `const isSandbox = Deno.env.get('CH_MODE') !== 'production'`
- Implement real CH API call path for production mode

### 3B. RTI/CIS Submit — Environment-Driven Toggle

- Replace `const isSandbox = true` in `rti-submit/index.ts` and `cis-submit/index.ts` with `const isSandbox = Deno.env.get('HMRC_MODE') !== 'production'`

---

## Phase 4: Clean-Up

- Remove duplicate `user_saved_views` policies
- Remove duplicate `ledger_entries` SELECT policy
- Resolve `api_rate_limits` zero-policy state
- Audit all SECURITY DEFINER functions for `search_path` settings

---

## Cross-Cutting Patterns Found

1. **RPC vs Direct Insert Inconsistency** — Safe RPCs built but legacy direct-insert code never migrated
2. **SELECT-Only RLS on Write Tables** — 8+ tables missing INSERT/UPDATE/DELETE policies
3. **Dead Code / Unwired Features** — Functions built but never called (session enforcement)
4. **Sandbox-Hardcoded Integrations** — No environment-driven production toggle
5. **Duplicate Policies / Migration Drift** — Iterative migrations adding duplicates

---

## Technical Scope

| Phase | Migration SQL | Code Files | Risk |
|-------|-------------|------------|------|
| 1 | 1 migration (~40 statements) | 1 file (auth context) | Low — enables broken features |
| 2 | 1 migration (policy updates) | 3 files (bills, payrun, mailbox) | Low — current paths broken |
| 3 | 0 migrations | 3 edge functions | None — sandbox still default |
| 4 | 1 migration (drop duplicates) | 0 files | None — cleanup only |

**Total: 3 migrations, ~7 code files changed.** No data backfill needed (zero rows in affected tables). No breaking changes to working features.


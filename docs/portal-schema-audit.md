# Portal Schema Audit & Stabilization

**Date:** 2025-12-01  
**Purpose:** Document the canonical portal-facing schema for the client portal app

---

## Executive Summary

The accountant backend has been stabilized with:
- ✅ Normalized `portal_access` and `portal_visibility_settings` tables
- ✅ 3 new portal-facing RPC functions for clean data access
- ✅ Demo data seeded for testing
- ✅ Complete RLS policies in place

The client portal app can now safely consume this backend without guessing schemas.

---

## Phase A: Schema Normalization

### 1. `portal_access` Table

**Final Schema:**
```sql
CREATE TABLE portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary_contact',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Changes Made:**
- ✅ Added `role` column (text, default 'primary_contact')
- ✅ Added `created_by` column (uuid, nullable)
- ✅ Added `updated_at` column (timestamptz, auto-updated via trigger)

**Constraints:**
- Exactly one of `client_id` or `company_id` must be non-null
- RLS enabled with policies for portal users and org users

---

### 2. `portal_visibility_settings` Table

**Final Schema:**
```sql
CREATE TABLE portal_visibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Visibility flags (all with defaults)
  show_revenue BOOLEAN NOT NULL DEFAULT true,
  show_profit BOOLEAN NOT NULL DEFAULT true,
  show_cash BOOLEAN NOT NULL DEFAULT true,
  show_vat_position BOOLEAN NOT NULL DEFAULT true,
  show_ct_estimate BOOLEAN NOT NULL DEFAULT true,
  show_receivables_payables BOOLEAN NOT NULL DEFAULT true,
  show_transactions BOOLEAN NOT NULL DEFAULT true,
  show_bank_accounts BOOLEAN NOT NULL DEFAULT true,
  show_invoices BOOLEAN NOT NULL DEFAULT true,
  show_trial_balance BOOLEAN NOT NULL DEFAULT false,
  show_detailed_ledger BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Changes Made:**
- ✅ Added `show_bank_accounts` (default true)
- ✅ Added `show_invoices` (default true)
- ✅ Added `show_trial_balance` (default false)
- ✅ Added `show_detailed_ledger` (default false)
- ✅ Set NOT NULL and defaults on all existing boolean columns

**Column Naming Notes for Client App:**
The client app expected different names. Here's the mapping:

| Client App Expected | Actual Column Name | Notes |
|---------------------|-------------------|-------|
| `show_net_profit` | `show_profit` | Use `show_profit` |
| `show_cash_balance` | `show_cash` | Use `show_cash` |
| `show_corporation_tax_estimate` | `show_ct_estimate` | Use `show_ct_estimate` |

---

## Phase B: Portal RPC Functions

### 1. `get_portal_entities_for_user(_user_id uuid)`

**Purpose:** Returns all entities (clients OR companies) a user has portal access to in a uniform shape.

**Returns:**
```typescript
{
  organization_id: string;
  entity_id: string;
  entity_type: 'client' | 'company';
  display_name: string;
  registration_number: string | null;
  tax_reference: string | null;
}[]
```

**Usage:**
```typescript
const { data: entities } = await supabase
  .rpc('get_portal_entities_for_user', { _user_id: user.id });
```

**Notes:**
- For companies: `display_name` = `companies.company_name`
- For clients: `display_name` = `first_name + ' ' + last_name`
- Only returns active portal_access records

---

### 2. `get_portal_visibility_for_entity(_user_id, _client_id?, _company_id?)`

**Purpose:** Returns visibility flags for an entity with sensible defaults.

**Returns:**
```typescript
{
  show_revenue: boolean;
  show_profit: boolean;
  show_cash: boolean;
  show_vat_position: boolean;
  show_ct_estimate: boolean;
  show_receivables_payables: boolean;
  show_transactions: boolean;
  show_bank_accounts: boolean;
  show_invoices: boolean;
  show_trial_balance: boolean;
  show_detailed_ledger: boolean;
}
```

**Usage:**
```typescript
const { data: visibility } = await supabase
  .rpc('get_portal_visibility_for_entity', {
    _user_id: user.id,
    _company_id: selectedCompanyId
  });
```

**Defaults (if no settings row exists):**
- Most KPIs: `true` (revenue, profit, cash, VAT, CT, transactions, bank accounts, invoices)
- Detailed data: `false` (trial balance, detailed ledger)

---

### 3. `get_portal_kpis_for_entity(_user_id, _client_id?, _company_id?, _period_start?, _period_end?)`

**Purpose:** Returns high-level dashboard KPIs for an entity.

**Returns:**
```typescript
{
  revenue: number;
  expenses: number;
  net_profit: number;
  cash_balance: number;
  vat_position: number | null;
  corporation_tax_estimate: number | null;
}
```

**Usage:**
```typescript
const { data: kpis } = await supabase
  .rpc('get_portal_kpis_for_entity', {
    _user_id: user.id,
    _company_id: selectedCompanyId,
    _period_start: '2025-01-01',
    _period_end: '2025-12-31'
  });
```

**Calculation Logic (MVP):**
- Revenue: Sum of INCOME accounts (credit - debit)
- Expenses: Sum of EXPENSE accounts (debit - credit)
- Net Profit: Revenue - Expenses
- Cash Balance: Sum of bank accounts (debit - credit)
- VAT Position: From latest `vat_returns` or NULL
- Corporation Tax Estimate: From finalised CT600 `workpaper_instances` or NULL

**Period Defaults:**
- If not provided: period_start = start of current year, period_end = today

---

## Critical Column Name Mappings for Client App

The client app should use these **actual column names** from the accountant backend:

### `clients` table
- ❌ `full_name` → ✅ `first_name` + `last_name` (concatenate)
- ❌ `client_type` → Not present (use entity_type from portal_access)

### `companies` table  
- ❌ `name` → ✅ `company_name`
- ❌ `registration_number` → ✅ `company_number`
- ❌ `tax_reference` → ✅ `vat_number`

### `portal_visibility_settings` table
- ❌ `show_net_profit` → ✅ `show_profit`
- ❌ `show_cash_balance` → ✅ `show_cash`
- ❌ `show_corporation_tax_estimate` → ✅ `show_ct_estimate`

---

## RLS Policies Summary

All portal-facing tables have RLS enabled with policies using `client_has_portal_access(auth.uid(), client_id, company_id)`:

**Tables with Portal RLS:**
- ✅ `portal_access`
- ✅ `portal_visibility_settings`
- ✅ `client_tasks`
- ✅ `client_messages`
- ✅ `deadlines`
- ✅ `bank_accounts`
- ✅ `bank_transactions`
- ✅ `invoices`
- ✅ `invoice_lines`
- ✅ `job_documents`
- ✅ `job_conversations`

**Helper Function:**
```sql
client_has_portal_access(_user_id uuid, _client_id uuid, _company_id uuid)
```
Returns `true` if user has active portal_access for the given client or company.

---

## Demo Data

**Organization:** My Practice (existing)  
**Demo Company:** Riverside Digital Ltd
- Company number: 12345678
- VAT number: GB123456789
- Year end: 31 March

**Sample Data Created:**
- ✅ 1 bank account ("Business Current Account")
- ✅ 2 client tasks ("Upload Year End Invoices", "Review Draft Accounts")
- ✅ 2 deadlines (CT600 due in 30 days, VAT100 due in 10 days)
- ✅ 1 invoice (£6,000 total, awaiting payment)

**To Test:**
See `docs/portal-demo-setup.md` for instructions on linking a test user.

---

## Security Linter Status

**Post-migration linter results:**
- ℹ️ INFO: 2 pre-existing tables with RLS enabled but no policies (not related to this migration)
- ⚠️ WARN: Leaked password protection disabled (global auth setting, not related to this migration)

**Migration-related issues:** None. All changes are additive (new columns, new RPCs) with existing RLS policies intact.

---

## Next Steps for Client Portal App

1. **Remove temporary type definitions**
   - Delete any local type definitions that duplicated backend types
   - Remove `as any` assertions

2. **Use the RPCs for data fetching**
   - Replace direct table queries with `get_portal_entities_for_user()`
   - Use `get_portal_visibility_for_entity()` for visibility checks
   - Use `get_portal_kpis_for_entity()` for dashboard KPIs

3. **Update column references**
   - Use the actual column names documented above
   - Update queries to reference correct columns (e.g., `company_name` not `name`)

4. **Test with demo data**
   - Create a test auth.users record
   - Link it to demo company via portal_access
   - Verify all features work with real backend data

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-01  
**Maintained By:** Accountant App Team
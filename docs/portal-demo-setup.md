# Portal Demo Setup Guide

This guide walks you through setting up a test user with portal access to demo data.

---

## Prerequisites

- Access to Supabase Dashboard for `moxpdejnucjjcplleefn` project
- Demo company "Riverside Digital Ltd" already created (see Phase C seed data)

---

## Step 1: Create Test Auth User

### Option A: Via Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create new user"
3. Enter test user details:
   - **Email:** `test.client@riversidedigital.co.uk`
   - **Password:** Choose a strong password
   - **Auto Confirm User:** ✅ Yes (important!)
4. Click "Create User"
5. **Copy the User ID** (UUID) from the users table

### Option B: Via Client Portal Signup Flow

1. Navigate to client portal signup page
2. Sign up with: `test.client@riversidedigital.co.uk`
3. Confirm email if auto-confirm is disabled
4. Get user ID from Supabase Dashboard → Authentication → Users

---

## Step 2: Link Test User to Demo Company

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
-- Replace 'YOUR_USER_ID_HERE' with the actual UUID from Step 1
INSERT INTO portal_access (
  organization_id,
  user_id,
  company_id,
  role,
  is_active
)
SELECT 
  o.id as organization_id,
  'YOUR_USER_ID_HERE'::uuid as user_id,
  c.id as company_id,
  'primary_contact' as role,
  true as is_active
FROM organizations o
CROSS JOIN companies c
WHERE o.name = 'My Practice'
  AND c.company_name = 'Riverside Digital Ltd';
```

**Verify the insert:**
```sql
SELECT 
  pa.id,
  pa.user_id,
  o.name as organization,
  c.company_name as company,
  pa.role,
  pa.is_active
FROM portal_access pa
JOIN organizations o ON o.id = pa.organization_id
JOIN companies c ON c.id = pa.company_id
WHERE pa.user_id = 'YOUR_USER_ID_HERE'::uuid;
```

You should see 1 row with "My Practice" and "Riverside Digital Ltd".

---

## Step 3: Test Portal Access

### Test the RPCs

```sql
-- Test get_portal_entities_for_user
SELECT * FROM get_portal_entities_for_user('YOUR_USER_ID_HERE'::uuid);

-- Expected result: 1 row with Riverside Digital Ltd

-- Test get_portal_visibility_for_entity  
SELECT * FROM get_portal_visibility_for_entity(
  'YOUR_USER_ID_HERE'::uuid,
  NULL,
  (SELECT id FROM companies WHERE company_name = 'Riverside Digital Ltd')
);

-- Expected result: All visibility flags with defaults

-- Test get_portal_kpis_for_entity
SELECT * FROM get_portal_kpis_for_entity(
  'YOUR_USER_ID_HERE'::uuid,
  NULL,
  (SELECT id FROM companies WHERE company_name = 'Riverside Digital Ltd')
);

-- Expected result: KPIs (may be zero if no ledger entries exist)
```

---

## Step 4: Verify Demo Data Access

Check that the test user can access demo data via RLS policies:

```sql
-- Set session to test user
SET request.jwt.claims.sub = 'YOUR_USER_ID_HERE';

-- Test client_tasks access
SELECT id, title, status, due_date
FROM client_tasks
WHERE company_id = (SELECT id FROM companies WHERE company_name = 'Riverside Digital Ltd');

-- Expected: 2 tasks (Upload Year End Invoices, Review Draft Accounts)

-- Test deadlines access
SELECT id, name, deadline_type, due_date, status
FROM deadlines
WHERE company_id = (SELECT id FROM companies WHERE company_name = 'Riverside Digital Ltd');

-- Expected: 2 deadlines (CT600, VAT100)

-- Test invoices access
SELECT id, contact_name, total_gross, status
FROM invoices
WHERE company_id = (SELECT id FROM companies WHERE company_name = 'Riverside Digital Ltd');

-- Expected: 1 invoice (Acme Corp, £6,000)
```

---

## Step 5: Login to Client Portal

1. Navigate to client portal login page
2. Login with: `test.client@riversidedigital.co.uk` + password from Step 1
3. Verify you can see:
   - ✅ Riverside Digital Ltd in entity selector
   - ✅ 2 tasks on Tasks page
   - ✅ 2 deadlines on Deadlines page
   - ✅ 1 invoice on Documents page
   - ✅ KPIs on Overview/Financials page (may show zeros)

---

## Troubleshooting

### "Access denied" errors in RPCs
- Verify `portal_access` row exists for your user ID
- Check `is_active = true` in portal_access
- Ensure company_id matches demo company

### No data showing in client portal
- Verify RLS policies are enabled on tables
- Check `client_has_portal_access()` function exists
- Run Step 4 SQL queries to verify RLS is working

### Cannot login to client portal
- Check user exists in auth.users
- Verify email is confirmed (auto-confirm should be ON)
- Check for any auth configuration issues

---

## Adding More Demo Data

To add ledger entries for more realistic KPIs:

```sql
-- Add sample revenue ledger entry
INSERT INTO ledger_entries (
  organization_id,
  company_id,
  account_id,
  transaction_date,
  description,
  credit,
  debit
)
SELECT 
  o.id,
  c.id,
  ba.id,
  CURRENT_DATE - INTERVAL '10 days',
  'Sales revenue - Q4 2024',
  10000.00,
  0
FROM organizations o
CROSS JOIN companies c
CROSS JOIN bookkeeping_accounts ba
WHERE o.name = 'My Practice'
  AND c.company_name = 'Riverside Digital Ltd'
  AND ba.account_type = 'INCOME'
  AND ba.code = '4000';

-- Add sample expense ledger entry
INSERT INTO ledger_entries (
  organization_id,
  company_id,
  account_id,
  transaction_date,
  description,
  debit,
  credit
)
SELECT 
  o.id,
  c.id,
  ba.id,
  CURRENT_DATE - INTERVAL '5 days',
  'Office rent - December',
  2000.00,
  0
FROM organizations o
CROSS JOIN companies c
CROSS JOIN bookkeeping_accounts ba
WHERE o.name = 'My Practice'
  AND c.company_name = 'Riverside Digital Ltd'
  AND ba.account_type = 'EXPENSE'
  AND ba.code = '6300';
```

Then re-run `get_portal_kpis_for_entity()` to see non-zero values.

---

## Quick Reset (if needed)

To remove test user and start over:

```sql
-- This will cascade and delete portal_access records too
DELETE FROM auth.users WHERE email = 'test.client@riversidedigital.co.uk';
```

Then repeat Step 1.

---

**Last Updated:** 2025-12-01  
**Maintained By:** Accountant App Team
# Seed Portal B + auto-seed all new organizations

## Problem

`Portal B's Practice` (`54804f3d-20f4-4656-9c33-54d7f0e02fb5`) has 0 rows in `services_catalog`, `automation_rules`, `automation_chaser_policies`, `message_templates`, and `job_templates`. Only the Greenfield test firm has the 15 standard services. The `create_organization_with_owner` RPC does not seed any defaults, so every signup lands in an empty practice.

## Goal

1. Add a reusable `public.seed_organization_defaults(org_id)` SECURITY DEFINER function containing the canonical defaults.
2. Call it from `create_organization_with_owner` so all new orgs are seeded automatically.
3. Call it once for Portal B to backfill its practice.

## What gets seeded per org

**Services catalogue (15 rows)** — exact set already in Greenfield, codes:
`sa_non_mtd, sa_mtd, company_accounts, corporation_tax, vat_return, mtd_quarterly, payroll, pensions, cis, p11d, confirmation_statement, registered_office, BOOKKEEPING, cgt_60_day, advisory` with the same `billing_model`, `default_price`, `is_recurring`, `entity_scope` values currently in Greenfield.

**Chaser message templates (3 rows in `chaser_message_templates`)** — Friendly / Standard / Firm tone bodies for records-request reminders, with `{{client_name}}`, `{{job_name}}`, `{{deadline_date}}` placeholders.

**Chaser policies (3 rows in `automation_chaser_policies`)** — disabled by default so nothing fires unexpectedly:
- Records request reminder (T-21, T-14, T-7 days before deadline)
- Signature reminder (T-7, T-3, T-1)
- Overdue records (D+3, D+7, D+14)

**Message templates (4 rows in `message_templates`)** — engagement-letter cover, welcome email, records-request email, year-end summary email. Subject + HTML body with standard placeholders.

No `automation_rules` or `job_templates` are seeded — those are practice-specific and should stay opt-in.

## Implementation

### Migration 1 — `seed_organization_defaults` function + hook

```sql
CREATE OR REPLACE FUNCTION public.seed_organization_defaults(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotent guard: do nothing if catalogue already populated
  IF EXISTS (SELECT 1 FROM services_catalog WHERE organization_id = p_org_id) THEN
    RETURN;
  END IF;

  INSERT INTO services_catalog (organization_id, code, name, billing_model,
    default_price, is_recurring, entity_scope, active)
  VALUES
    (p_org_id, 'sa_non_mtd',            'Self-Assessment Tax Return',  'fixed',   250.00, true,  'individual', true),
    (p_org_id, 'sa_mtd',                'Self-Assessment (MTD)',       'monthly',  35.00, true,  'individual', true),
    (p_org_id, 'company_accounts',      'Company Accounts',            'fixed',   850.00, true,  'company',    true),
    (p_org_id, 'corporation_tax',       'Corporation Tax Return (CT600)','fixed', 350.00, true,  'company',    true),
    (p_org_id, 'vat_return',            'VAT Return',                  'fixed',   150.00, true,  'either',     true),
    (p_org_id, 'mtd_quarterly',         'MTD Quarterly Submission',    'fixed',    75.00, true,  'either',     true),
    (p_org_id, 'payroll',               'Payroll',                     'monthly',  25.00, true,  'either',     true),
    (p_org_id, 'pensions',              'Workplace Pensions',          'monthly',  20.00, true,  'either',     true),
    (p_org_id, 'cis',                   'CIS Returns',                 'monthly',  50.00, true,  'either',     true),
    (p_org_id, 'p11d',                  'P11D & Benefits in Kind',     'fixed',    75.00, true,  'either',     true),
    (p_org_id, 'confirmation_statement','Confirmation Statement (CS01)','fixed',   50.00, true,  'company',    true),
    (p_org_id, 'registered_office',     'Registered Office Service',   'monthly',  15.00, true,  'company',    true),
    (p_org_id, 'BOOKKEEPING',           'Bookkeeping',                 'monthly', 150.00, true,  'either',     true),
    (p_org_id, 'cgt_60_day',            'CGT 60-Day Return',           'fixed',   350.00, false, 'individual', true),
    (p_org_id, 'advisory',              'Advisory & Consultancy',      'hourly',  150.00, false, 'either',     true);

  -- chaser_message_templates, automation_chaser_policies (disabled),
  -- message_templates inserts go here (full SQL in migration).
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_organization_defaults(uuid) TO authenticated, service_role;

-- Hook into existing org creation
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(...)
-- (re-emit existing body, then add at the end, before RETURN:)
  PERFORM public.seed_organization_defaults(v_new_org_id);
```

### One-off backfill

After the migration runs, call:

```sql
SELECT public.seed_organization_defaults('54804f3d-20f4-4656-9c33-54d7f0e02fb5');
```

via the insert tool, to populate Portal B's practice immediately.

## Verification

1. `SELECT count(*) FROM services_catalog WHERE organization_id = '54804f3d…'` returns 15.
2. Sign in as Portal B in the preview → `/services` shows the 15 standard services, `/automations` shows 3 disabled chaser policies and 3 chaser message templates.
3. Create a fresh test org → confirm it is seeded automatically with the same counts.

## Out of scope

- No new `automation_rules` or `job_templates` (kept opt-in).
- No edits to the accountant UI; this is purely a data + DB-function change.
- Greenfield's existing data is unchanged (the function is idempotent and short-circuits when a catalogue already exists).

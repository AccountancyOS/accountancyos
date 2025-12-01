-- Phase A: Schema Normalization
-- A1. Add missing columns to portal_access
ALTER TABLE portal_access 
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'primary_contact',
ADD COLUMN IF NOT EXISTS created_by uuid NULL,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add trigger for updated_at on portal_access
CREATE TRIGGER set_portal_access_updated_at
  BEFORE UPDATE ON portal_access
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- A2. Add missing columns and defaults to portal_visibility_settings
ALTER TABLE portal_visibility_settings 
ADD COLUMN IF NOT EXISTS show_bank_accounts boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS show_invoices boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS show_trial_balance boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS show_detailed_ledger boolean NOT NULL DEFAULT false;

-- Set defaults and NOT NULL on existing columns
ALTER TABLE portal_visibility_settings 
ALTER COLUMN show_revenue SET DEFAULT true,
ALTER COLUMN show_revenue SET NOT NULL,
ALTER COLUMN show_profit SET DEFAULT true,
ALTER COLUMN show_profit SET NOT NULL,
ALTER COLUMN show_cash SET DEFAULT true,
ALTER COLUMN show_cash SET NOT NULL,
ALTER COLUMN show_vat_position SET DEFAULT true,
ALTER COLUMN show_vat_position SET NOT NULL,
ALTER COLUMN show_ct_estimate SET DEFAULT true,
ALTER COLUMN show_ct_estimate SET NOT NULL,
ALTER COLUMN show_receivables_payables SET DEFAULT true,
ALTER COLUMN show_receivables_payables SET NOT NULL,
ALTER COLUMN show_transactions SET DEFAULT true,
ALTER COLUMN show_transactions SET NOT NULL;

-- Phase B: Create Portal RPCs
-- B1. get_portal_entities_for_user: Returns all entities a user has portal access to
CREATE OR REPLACE FUNCTION public.get_portal_entities_for_user(
  _user_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  entity_id uuid,
  entity_type text,
  display_name text,
  registration_number text,
  tax_reference text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Get companies
  SELECT 
    pa.organization_id,
    c.id as entity_id,
    'company'::text as entity_type,
    c.company_name as display_name,
    c.company_number as registration_number,
    c.vat_number as tax_reference
  FROM portal_access pa
  JOIN companies c ON c.id = pa.company_id
  WHERE pa.user_id = _user_id
    AND pa.is_active = true
    AND pa.company_id IS NOT NULL
  
  UNION ALL
  
  -- Get clients
  SELECT 
    pa.organization_id,
    cl.id as entity_id,
    'client'::text as entity_type,
    (cl.first_name || ' ' || cl.last_name) as display_name,
    NULL as registration_number,
    cl.utr as tax_reference
  FROM portal_access pa
  JOIN clients cl ON cl.id = pa.client_id
  WHERE pa.user_id = _user_id
    AND pa.is_active = true
    AND pa.client_id IS NOT NULL
$$;

-- B2. get_portal_visibility_for_entity: Returns visibility settings with defaults
CREATE OR REPLACE FUNCTION public.get_portal_visibility_for_entity(
  _user_id uuid,
  _client_id uuid DEFAULT NULL,
  _company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  show_revenue boolean,
  show_profit boolean,
  show_cash boolean,
  show_vat_position boolean,
  show_ct_estimate boolean,
  show_receivables_payables boolean,
  show_transactions boolean,
  show_bank_accounts boolean,
  show_invoices boolean,
  show_trial_balance boolean,
  show_detailed_ledger boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Verify user has access to this entity
  IF NOT client_has_portal_access(_user_id, _client_id, _company_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get organization_id from portal_access
  SELECT organization_id INTO _org_id
  FROM portal_access
  WHERE user_id = _user_id
    AND is_active = true
    AND (
      (_client_id IS NOT NULL AND client_id = _client_id) OR
      (_company_id IS NOT NULL AND company_id = _company_id)
    )
  LIMIT 1;

  -- Return entity-specific settings if they exist, otherwise return defaults
  RETURN QUERY
  SELECT 
    COALESCE(pvs.show_revenue, true) as show_revenue,
    COALESCE(pvs.show_profit, true) as show_profit,
    COALESCE(pvs.show_cash, true) as show_cash,
    COALESCE(pvs.show_vat_position, true) as show_vat_position,
    COALESCE(pvs.show_ct_estimate, true) as show_ct_estimate,
    COALESCE(pvs.show_receivables_payables, true) as show_receivables_payables,
    COALESCE(pvs.show_transactions, true) as show_transactions,
    COALESCE(pvs.show_bank_accounts, true) as show_bank_accounts,
    COALESCE(pvs.show_invoices, true) as show_invoices,
    COALESCE(pvs.show_trial_balance, false) as show_trial_balance,
    COALESCE(pvs.show_detailed_ledger, false) as show_detailed_ledger
  FROM (
    SELECT 
      NULL::boolean as show_revenue,
      NULL::boolean as show_profit,
      NULL::boolean as show_cash,
      NULL::boolean as show_vat_position,
      NULL::boolean as show_ct_estimate,
      NULL::boolean as show_receivables_payables,
      NULL::boolean as show_transactions,
      NULL::boolean as show_bank_accounts,
      NULL::boolean as show_invoices,
      NULL::boolean as show_trial_balance,
      NULL::boolean as show_detailed_ledger
  ) defaults
  LEFT JOIN portal_visibility_settings pvs ON (
    pvs.organization_id = _org_id
    AND (
      (_client_id IS NOT NULL AND pvs.client_id = _client_id) OR
      (_company_id IS NOT NULL AND pvs.company_id = _company_id)
    )
  )
  LIMIT 1;
END;
$$;

-- B3. get_portal_kpis_for_entity: Returns KPI dashboard numbers (MVP version using ledger)
CREATE OR REPLACE FUNCTION public.get_portal_kpis_for_entity(
  _user_id uuid,
  _client_id uuid DEFAULT NULL,
  _company_id uuid DEFAULT NULL,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL
)
RETURNS TABLE (
  revenue numeric,
  expenses numeric,
  net_profit numeric,
  cash_balance numeric,
  vat_position numeric,
  corporation_tax_estimate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Verify user has access to this entity
  IF NOT client_has_portal_access(_user_id, _client_id, _company_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get organization_id
  SELECT organization_id INTO _org_id
  FROM portal_access
  WHERE user_id = _user_id
    AND is_active = true
    AND (
      (_client_id IS NOT NULL AND client_id = _client_id) OR
      (_company_id IS NOT NULL AND company_id = _company_id)
    )
  LIMIT 1;

  -- Set default period to current year if not provided
  IF _period_start IS NULL THEN
    _period_start := date_trunc('year', CURRENT_DATE)::date;
  END IF;
  
  IF _period_end IS NULL THEN
    _period_end := CURRENT_DATE;
  END IF;

  -- Calculate KPIs from ledger_entries
  RETURN QUERY
  SELECT 
    -- Revenue: sum of INCOME accounts (credit - debit)
    COALESCE((
      SELECT SUM(le.credit - le.debit)
      FROM ledger_entries le
      JOIN bookkeeping_accounts ba ON ba.id = le.account_id
      WHERE ba.organization_id = _org_id
        AND ba.account_type = 'INCOME'
        AND (
          (_client_id IS NOT NULL AND le.client_id = _client_id) OR
          (_company_id IS NOT NULL AND le.company_id = _company_id)
        )
        AND le.transaction_date BETWEEN _period_start AND _period_end
    ), 0) as revenue,
    
    -- Expenses: sum of EXPENSE accounts (debit - credit)
    COALESCE((
      SELECT SUM(le.debit - le.credit)
      FROM ledger_entries le
      JOIN bookkeeping_accounts ba ON ba.id = le.account_id
      WHERE ba.organization_id = _org_id
        AND ba.account_type = 'EXPENSE'
        AND (
          (_client_id IS NOT NULL AND le.client_id = _client_id) OR
          (_company_id IS NOT NULL AND le.company_id = _company_id)
        )
        AND le.transaction_date BETWEEN _period_start AND _period_end
    ), 0) as expenses,
    
    -- Net Profit: revenue - expenses (calculated in select)
    COALESCE((
      SELECT SUM(le.credit - le.debit)
      FROM ledger_entries le
      JOIN bookkeeping_accounts ba ON ba.id = le.account_id
      WHERE ba.organization_id = _org_id
        AND ba.account_type = 'INCOME'
        AND (
          (_client_id IS NOT NULL AND le.client_id = _client_id) OR
          (_company_id IS NOT NULL AND le.company_id = _company_id)
        )
        AND le.transaction_date BETWEEN _period_start AND _period_end
    ), 0) - COALESCE((
      SELECT SUM(le.debit - le.credit)
      FROM ledger_entries le
      JOIN bookkeeping_accounts ba ON ba.id = le.account_id
      WHERE ba.organization_id = _org_id
        AND ba.account_type = 'EXPENSE'
        AND (
          (_client_id IS NOT NULL AND le.client_id = _client_id) OR
          (_company_id IS NOT NULL AND le.company_id = _company_id)
        )
        AND le.transaction_date BETWEEN _period_start AND _period_end
    ), 0) as net_profit,
    
    -- Cash Balance: sum of bank accounts (debit - credit)
    COALESCE((
      SELECT SUM(le.debit - le.credit)
      FROM ledger_entries le
      JOIN bookkeeping_accounts ba ON ba.id = le.account_id
      WHERE ba.organization_id = _org_id
        AND ba.is_bank_account = true
        AND (
          (_client_id IS NOT NULL AND le.client_id = _client_id) OR
          (_company_id IS NOT NULL AND le.company_id = _company_id)
        )
    ), 0) as cash_balance,
    
    -- VAT Position: from latest vat_return or NULL
    (
      SELECT vat_due
      FROM vat_returns
      WHERE organization_id = _org_id
        AND (
          (_client_id IS NOT NULL AND client_id = _client_id) OR
          (_company_id IS NOT NULL AND company_id = _company_id)
        )
      ORDER BY period_end DESC
      LIMIT 1
    ) as vat_position,
    
    -- Corporation Tax Estimate: from finalised workpaper or NULL
    (
      SELECT (computed_data->>'tax_liability')::numeric
      FROM workpaper_instances wi
      WHERE wi.organization_id = _org_id
        AND wi.workpaper_type = 'CT600'
        AND wi.status = 'finalised'
        AND (
          (_client_id IS NOT NULL AND wi.client_id = _client_id) OR
          (_company_id IS NOT NULL AND wi.company_id = _company_id)
        )
      ORDER BY wi.finalised_at DESC
      LIMIT 1
    ) as corporation_tax_estimate;
END;
$$;
-- Phase 5 Block A Slice 1: Profit & Loss and Balance Sheet RPCs
-- Both read exclusively from ledger_entries (immutable single source of truth)
-- and join bookkeeping_accounts for classification.

CREATE OR REPLACE FUNCTION public.get_profit_and_loss(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_from_date date,
  p_to_date date
) RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  account_subtype text,
  debit_total numeric,
  credit_total numeric,
  net_amount numeric  -- signed: income positive, expense negative
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorisation: caller must belong to organisation
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF (p_client_id IS NULL AND p_company_id IS NULL) OR
     (p_client_id IS NOT NULL AND p_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'entity_scope_required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name,
    a.account_type,
    a.account_subtype,
    COALESCE(SUM(le.debit), 0)::numeric  AS debit_total,
    COALESCE(SUM(le.credit), 0)::numeric AS credit_total,
    CASE
      WHEN a.account_type = 'INCOME'  THEN COALESCE(SUM(le.credit - le.debit), 0)
      WHEN a.account_type = 'EXPENSE' THEN COALESCE(SUM(le.debit - le.credit), 0) * -1
      ELSE 0
    END::numeric AS net_amount
  FROM public.bookkeeping_accounts a
  LEFT JOIN public.ledger_entries le
    ON le.account_id = a.id
   AND le.organization_id = p_organization_id
   AND ((p_client_id  IS NOT NULL AND le.client_id  = p_client_id) OR
        (p_company_id IS NOT NULL AND le.company_id = p_company_id))
   AND le.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND ((p_client_id  IS NOT NULL AND a.client_id  = p_client_id) OR
         (p_company_id IS NOT NULL AND a.company_id = p_company_id))
    AND a.account_type IN ('INCOME','EXPENSE')
  GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype
  HAVING COALESCE(SUM(le.debit), 0) <> 0 OR COALESCE(SUM(le.credit), 0) <> 0
  ORDER BY a.account_type DESC, a.code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_and_loss(uuid,uuid,uuid,date,date) TO authenticated;

-- Balance Sheet as at a date. Equity includes computed retained earnings
-- (cumulative net income from all dates up to p_as_at_date for INCOME-EXPENSE
-- accounts) returned as a synthetic row with a NULL account_id.

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_as_at_date date
) RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  account_subtype text,
  balance numeric  -- signed: assets positive, liabilities & equity negative-of-natural-credit normalised
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retained_earnings numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF (p_client_id IS NULL AND p_company_id IS NULL) OR
     (p_client_id IS NOT NULL AND p_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'entity_scope_required' USING ERRCODE = '22023';
  END IF;

  -- Cumulative retained earnings = sum of (credit-debit) on INCOME minus (debit-credit) on EXPENSE,
  -- across all dates up to and including p_as_at_date.
  SELECT
    COALESCE(SUM(
      CASE
        WHEN a.account_type = 'INCOME'  THEN le.credit - le.debit
        WHEN a.account_type = 'EXPENSE' THEN le.credit - le.debit
        ELSE 0
      END
    ), 0)
  INTO v_retained_earnings
  FROM public.ledger_entries le
  JOIN public.bookkeeping_accounts a ON a.id = le.account_id
  WHERE le.organization_id = p_organization_id
    AND ((p_client_id  IS NOT NULL AND le.client_id  = p_client_id) OR
         (p_company_id IS NOT NULL AND le.company_id = p_company_id))
    AND le.entry_date <= p_as_at_date
    AND a.account_type IN ('INCOME','EXPENSE');

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name,
    a.account_type,
    a.account_subtype,
    CASE
      WHEN a.account_type = 'ASSET'     THEN COALESCE(SUM(le.debit - le.credit), 0)
      WHEN a.account_type = 'LIABILITY' THEN COALESCE(SUM(le.credit - le.debit), 0)
      WHEN a.account_type = 'EQUITY'    THEN COALESCE(SUM(le.credit - le.debit), 0)
      ELSE 0
    END::numeric AS balance
  FROM public.bookkeeping_accounts a
  LEFT JOIN public.ledger_entries le
    ON le.account_id = a.id
   AND le.organization_id = p_organization_id
   AND ((p_client_id  IS NOT NULL AND le.client_id  = p_client_id) OR
        (p_company_id IS NOT NULL AND le.company_id = p_company_id))
   AND le.entry_date <= p_as_at_date
  WHERE a.organization_id = p_organization_id
    AND ((p_client_id  IS NOT NULL AND a.client_id  = p_client_id) OR
         (p_company_id IS NOT NULL AND a.company_id = p_company_id))
    AND a.account_type IN ('ASSET','LIABILITY','EQUITY')
  GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype
  HAVING COALESCE(SUM(le.debit), 0) <> 0 OR COALESCE(SUM(le.credit), 0) <> 0
  ORDER BY a.account_type, a.code;

  -- Append synthetic retained-earnings row (current-period + prior cumulative).
  IF v_retained_earnings <> 0 THEN
    RETURN QUERY SELECT
      NULL::uuid,
      '__RETAINED_EARNINGS__'::text,
      'Retained Earnings (Computed)'::text,
      'EQUITY'::text,
      'RETAINED_EARNINGS'::text,
      v_retained_earnings::numeric;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(uuid,uuid,uuid,date) TO authenticated;
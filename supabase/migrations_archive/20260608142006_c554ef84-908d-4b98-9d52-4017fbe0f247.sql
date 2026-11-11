
CREATE OR REPLACE FUNCTION public.seed_standard_chart_of_accounts(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted int := 0;
  v_actor uuid := auth.uid();
  v_ar uuid; v_ap uuid; v_vat uuid; v_bc uuid; v_obe uuid; v_re uuid;
  v_susp uuid; v_dl uuid; v_fa uuid; v_ad uuid;
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF (p_client_id IS NULL AND p_company_id IS NULL)
     OR (p_client_id IS NOT NULL AND p_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of client_id or company_id must be provided';
  END IF;

  IF v_actor IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM organization_users
                      WHERE organization_id = p_organization_id AND user_id = v_actor) THEN
    RAISE EXCEPTION 'Caller is not a member of the target organization';
  END IF;

  v_entity_type := CASE WHEN p_client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(p_client_id, p_company_id);

  -- Seed accounts idempotently
  WITH seed(code, name, account_type, account_subtype, is_control, is_bank) AS (
    VALUES
      ('1000','Bank Current Account','ASSET','BANK', false, true),
      ('1100','Accounts Receivable','ASSET','TRADE_DEBTORS', true, false),
      ('1200','Fixed Assets','ASSET','FIXED_ASSETS', false, false),
      ('1210','Accumulated Depreciation','ASSET','ACCUMULATED_DEPRECIATION', false, false),
      ('1500','Stock / Inventory','ASSET','INVENTORY', false, false),
      ('2000','Accounts Payable','LIABILITY','TRADE_CREDITORS', true, false),
      ('2100','VAT Control','LIABILITY','VAT_CONTROL', true, false),
      ('2200','PAYE / NIC Control','LIABILITY','PAYE_NIC', true, false),
      ('2210','Pension Control','LIABILITY','PENSION_CONTROL', true, false),
      ('2300','Corporation Tax Control','LIABILITY','CT_CONTROL', true, false),
      ('2400','Director Loan','LIABILITY','DIRECTOR_LOAN', false, false),
      ('3000','Share Capital','EQUITY','SHARE_CAPITAL', false, false),
      ('3100','Retained Earnings','EQUITY','RETAINED_EARNINGS', false, false),
      ('3200','Opening Balance Equity','EQUITY','OPENING_BALANCE_EQUITY', false, false),
      ('3900','Suspense Account','EQUITY','SUSPENSE', false, false),
      ('4000','Sales','INCOME','SALES', false, false),
      ('4900','Sales Discounts','INCOME','SALES_DISCOUNTS', false, false),
      ('5000','Cost of Sales','EXPENSE','COST_OF_SALES', false, false),
      ('5100','Purchases','EXPENSE','PURCHASES', false, false),
      ('6000','Wages and Salaries','EXPENSE','WAGES', false, false),
      ('7000','Bank Charges','EXPENSE','BANK_CHARGES', false, false),
      ('7900','Bad Debts','EXPENSE','BAD_DEBTS', false, false)
  )
  INSERT INTO bookkeeping_accounts
    (organization_id, client_id, company_id, code, name,
     account_type, account_subtype, is_control_account, is_bank_account,
     is_system_account, is_active)
  SELECT p_organization_id, p_client_id, p_company_id, s.code, s.name,
         s.account_type, s.account_subtype, s.is_control, s.is_bank,
         true, true
    FROM seed s
   WHERE NOT EXISTS (
     SELECT 1 FROM bookkeeping_accounts a
      WHERE a.organization_id = p_organization_id
        AND a.code = s.code
        AND ((p_client_id IS NOT NULL AND a.client_id  = p_client_id)
          OR (p_company_id IS NOT NULL AND a.company_id = p_company_id))
   );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Look up the seeded ids (whether just inserted or pre-existing)
  SELECT id INTO v_ar  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '1100'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_ap  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '2000'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_vat FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '2100'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_bc  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '7000'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_obe FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '3200'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_re  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '3100'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_susp FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '3900'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_dl  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '2400'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_fa  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '1200'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));
  SELECT id INTO v_ad  FROM bookkeeping_accounts WHERE organization_id = p_organization_id AND code = '1210'
    AND ((p_client_id IS NOT NULL AND client_id  = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id));

  -- Populate org_settings control-account pointers if not already set.
  -- org_settings is org-scoped (one row per org), so we use the first matching row.
  UPDATE org_settings
     SET accounts_receivable_account_id   = COALESCE(accounts_receivable_account_id,   v_ar),
         accounts_payable_account_id      = COALESCE(accounts_payable_account_id,      v_ap),
         vat_control_account_id           = COALESCE(vat_control_account_id,           v_vat),
         bank_charges_account_id          = COALESCE(bank_charges_account_id,          v_bc),
         opening_balance_equity_account_id= COALESCE(opening_balance_equity_account_id,v_obe),
         retained_earnings_account_id     = COALESCE(retained_earnings_account_id,     v_re),
         suspense_account_id              = COALESCE(suspense_account_id,              v_susp),
         director_loan_account_id         = COALESCE(director_loan_account_id,         v_dl),
         fixed_assets_account_id          = COALESCE(fixed_assets_account_id,          v_fa),
         accumulated_depreciation_account_id = COALESCE(accumulated_depreciation_account_id, v_ad)
   WHERE organization_id = p_organization_id;

  INSERT INTO bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, after_state)
  VALUES (p_organization_id, v_entity_type, v_entity_id, 'seed_standard_chart', v_actor,
          jsonb_build_object('inserted', v_inserted));

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_standard_chart_of_accounts(uuid, uuid, uuid)
  TO authenticated, service_role;

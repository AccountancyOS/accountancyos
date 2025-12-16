-- Create deterministic test CT600 filing generator RPC
-- Idempotent: same test_run_key returns same filing without duplicates
-- Deterministic: company_number and utr derived from test_run_key hash

CREATE OR REPLACE FUNCTION public.create_test_ct600_filing(
  p_organization_id UUID,
  p_test_run_key TEXT,
  p_period_start DATE,
  p_period_end DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_filing_id UUID;
  v_company_id UUID;
  v_ct_snapshot_id UUID;
  v_model_snapshot_id UUID;
  v_filing_id UUID;
  v_company_number TEXT;
  v_utr TEXT;
  v_company_name TEXT;
  v_hash_hex TEXT;
  v_ct600_artefact_id UUID;
  v_ixbrl_accounts_id UUID;
  v_ixbrl_computation_id UUID;
  v_ct_data JSONB;
  v_snapshot_hash TEXT;
BEGIN
  -- Generate deterministic values from test_run_key
  v_hash_hex := encode(sha256(p_test_run_key::bytea), 'hex');
  v_company_number := 'TC' || UPPER(LEFT(v_hash_hex, 6));
  -- Extract 10 numeric digits from hash for UTR (format-valid only)
  v_utr := LPAD(
    (('x' || LEFT(v_hash_hex, 8))::bit(32)::bigint % 10000000000)::text, 
    10, '0'
  );
  v_company_name := 'Test CT600 Company - ' || p_test_run_key;

  -- Check for existing filing with same test_run_key (idempotency)
  SELECT f.id, f.company_id, f.ct_snapshot_id, f.model_snapshot_id
  INTO v_existing_filing_id, v_company_id, v_ct_snapshot_id, v_model_snapshot_id
  FROM public.filings f
  WHERE f.organization_id = p_organization_id
    AND f.filing_data->>'test_run_key' = p_test_run_key;

  IF v_existing_filing_id IS NOT NULL THEN
    -- Return existing filing
    SELECT fa.id INTO v_ct600_artefact_id
    FROM public.filing_artefacts fa
    WHERE fa.filing_id = v_existing_filing_id AND fa.artefact_type = 'CT600_XML'
    LIMIT 1;

    SELECT fa.id INTO v_ixbrl_accounts_id
    FROM public.filing_artefacts fa
    WHERE fa.filing_id = v_existing_filing_id AND fa.artefact_type = 'IXBRL_ACCOUNTS'
    LIMIT 1;

    SELECT fa.id INTO v_ixbrl_computation_id
    FROM public.filing_artefacts fa
    WHERE fa.filing_id = v_existing_filing_id AND fa.artefact_type = 'IXBRL_CT_COMPUTATION'
    LIMIT 1;

    RETURN jsonb_build_object(
      'filing_id', v_existing_filing_id,
      'company_id', v_company_id,
      'ct_snapshot_id', v_ct_snapshot_id,
      'model_snapshot_id', v_model_snapshot_id,
      'artefact_ids', jsonb_build_object(
        'CT600_XML', v_ct600_artefact_id,
        'IXBRL_ACCOUNTS', v_ixbrl_accounts_id,
        'IXBRL_CT_COMPUTATION', v_ixbrl_computation_id
      ),
      'test_run_key', p_test_run_key,
      'already_existed', true
    );
  END IF;

  -- Create test company
  INSERT INTO public.companies (
    organization_id,
    company_name,
    company_number,
    utr,
    address_line_1,
    city,
    postcode,
    country,
    incorporation_date,
    is_active
  ) VALUES (
    p_organization_id,
    v_company_name,
    v_company_number,
    v_utr,
    '123 Test Street',
    'London',
    'EC1A 1BB',
    'United Kingdom',
    p_period_start - INTERVAL '1 year',
    true
  )
  RETURNING id INTO v_company_id;

  -- Create CT computation data
  v_ct_data := jsonb_build_object(
    'accounting_profit', 100000,
    'total_add_backs', 5000,
    'add_backs_breakdown', jsonb_build_array(
      jsonb_build_object('description', 'Depreciation', 'amount', 5000, 'category', 'depreciation')
    ),
    'total_deductions', 0,
    'deductions_breakdown', jsonb_build_array(),
    'total_capital_allowances', 3000,
    'balancing_charges', 0,
    'net_capital_allowances', 3000,
    'pools_summary', jsonb_build_array(),
    'claims_summary', jsonb_build_array(),
    'taxable_total_profits', 102000,
    'applicable_rate', 'marginal',
    'effective_rate', 0.2175,
    'adjusted_lower_limit', 50000,
    'adjusted_upper_limit', 250000,
    'tax_at_main_rate', 25500,
    'marginal_relief_fraction', 0.015,
    'marginal_relief_amount', 2220,
    'corporation_tax_due', 23280,
    'short_period_factor', 1,
    'associated_companies_count', 0,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'balance_sheet', jsonb_build_object(
      'tangible_assets', 10000,
      'cash_at_bank', 50000,
      'debtors', 15000,
      'creditors_within_one_year', 8000,
      'net_current_assets', 57000,
      'total_assets_less_current_liabilities', 67000,
      'creditors_after_one_year', 0,
      'net_assets', 67000,
      'share_capital', 1,
      'retained_earnings', 66999,
      'total_equity', 67000
    )
  );

  -- Generate snapshot hash
  v_snapshot_hash := encode(sha256(v_ct_data::text::bytea), 'hex');

  -- Create CT computation snapshot
  INSERT INTO public.ct_computation_snapshots (
    organization_id,
    company_id,
    period_start,
    period_end,
    snapshot_data,
    snapshot_hash,
    status,
    generator_version
  ) VALUES (
    p_organization_id,
    v_company_id,
    p_period_start,
    p_period_end,
    v_ct_data,
    v_snapshot_hash,
    'approved',
    '1.2.0'
  )
  RETURNING id INTO v_ct_snapshot_id;

  -- Create filing model snapshot
  INSERT INTO public.filing_model_snapshots (
    organization_id,
    company_id,
    snapshot_type,
    period_start,
    period_end,
    snapshot_data,
    snapshot_hash,
    status,
    generator_version
  ) VALUES (
    p_organization_id,
    v_company_id,
    'ct600',
    p_period_start,
    p_period_end,
    v_ct_data,
    v_snapshot_hash,
    'approved',
    '1.2.0'
  )
  RETURNING id INTO v_model_snapshot_id;

  -- Create filing record
  INSERT INTO public.filings (
    organization_id,
    company_id,
    filing_type,
    filing_body,
    period_start,
    period_end,
    status,
    ct_snapshot_id,
    model_snapshot_id,
    filing_data,
    environment
  ) VALUES (
    p_organization_id,
    v_company_id,
    'CT600_HMRC',
    'HMRC',
    p_period_start,
    p_period_end,
    'approved',
    v_ct_snapshot_id,
    v_model_snapshot_id,
    jsonb_build_object(
      'test_run_key', p_test_run_key,
      'is_test_filing', true,
      'company_name', v_company_name,
      'company_number', v_company_number,
      'utr', v_utr
    ),
    'test'
  )
  RETURNING id INTO v_filing_id;

  -- Create CT600 XML artefact (minimal valid structure)
  INSERT INTO public.filing_artefacts (
    filing_id,
    organization_id,
    artefact_type,
    content,
    content_hash,
    content_encoding,
    metadata
  ) VALUES (
    v_filing_id,
    p_organization_id,
    'CT600_XML',
    '<TradingProfits><TurnoverPerAccounts>105000</TurnoverPerAccounts><TotalTradingProfits>105000</TotalTradingProfits></TradingProfits><TaxCalculation><TaxableProfit>102000</TaxableProfit><CorporationTaxDue>23280</CorporationTaxDue><MarginalRelief>2220</MarginalRelief><TotalCorporationTax>23280</TotalCorporationTax></TaxCalculation>',
    encode(sha256('CT600_XML_' || p_test_run_key), 'hex'),
    'utf8',
    jsonb_build_object(
      'generator_version', '1.2.0',
      'generated_at', NOW(),
      'test_artefact', true
    )
  )
  RETURNING id INTO v_ct600_artefact_id;

  -- Create iXBRL Accounts artefact (minimal valid structure)
  INSERT INTO public.filing_artefacts (
    filing_id,
    organization_id,
    artefact_type,
    content,
    content_hash,
    content_encoding,
    taxonomy_version,
    metadata
  ) VALUES (
    v_filing_id,
    p_organization_id,
    'IXBRL_ACCOUNTS',
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:uk-gaap="http://xbrl.frc.org.uk/reports/2022-01-01/uk-gaap" xml:lang="en"><head><title>' || v_company_name || ' - Test Accounts</title></head><body><ix:header><ix:resources><xbrli:context id="ctx1"><xbrli:entity><xbrli:identifier scheme="http://www.companieshouse.gov.uk/">' || v_company_number || '</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>' || p_period_end || '</xbrli:instant></xbrli:period></xbrli:context><xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit></ix:resources></ix:header><h1>' || v_company_name || '</h1><p>Test iXBRL Accounts</p></body></html>',
    encode(sha256('IXBRL_ACCOUNTS_' || p_test_run_key), 'hex'),
    'utf8',
    'FRC-2022-01-01',
    jsonb_build_object(
      'generator_version', '1.2.0',
      'generated_at', NOW(),
      'test_artefact', true
    )
  )
  RETURNING id INTO v_ixbrl_accounts_id;

  -- Create iXBRL CT Computation artefact (minimal valid structure)
  INSERT INTO public.filing_artefacts (
    filing_id,
    organization_id,
    artefact_type,
    content,
    content_hash,
    content_encoding,
    taxonomy_version,
    metadata
  ) VALUES (
    v_filing_id,
    p_organization_id,
    'IXBRL_CT_COMPUTATION',
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ct="http://xbrl.frc.org.uk/reports/2022-01-01/uk-core" xml:lang="en"><head><title>' || v_company_name || ' - CT Computation</title></head><body><ix:header><ix:resources><xbrli:context id="ctx1"><xbrli:entity><xbrli:identifier scheme="http://www.companieshouse.gov.uk/">' || v_company_number || '</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>' || p_period_start || '</xbrli:startDate><xbrli:endDate>' || p_period_end || '</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit></ix:resources></ix:header><h1>' || v_company_name || '</h1><p>Test CT Computation - Tax Due: £23,280</p></body></html>',
    encode(sha256('IXBRL_CT_COMPUTATION_' || p_test_run_key), 'hex'),
    'utf8',
    'FRC-2022-01-01',
    jsonb_build_object(
      'generator_version', '1.2.0',
      'generated_at', NOW(),
      'test_artefact', true
    )
  )
  RETURNING id INTO v_ixbrl_computation_id;

  -- Return result
  RETURN jsonb_build_object(
    'filing_id', v_filing_id,
    'company_id', v_company_id,
    'ct_snapshot_id', v_ct_snapshot_id,
    'model_snapshot_id', v_model_snapshot_id,
    'artefact_ids', jsonb_build_object(
      'CT600_XML', v_ct600_artefact_id,
      'IXBRL_ACCOUNTS', v_ixbrl_accounts_id,
      'IXBRL_CT_COMPUTATION', v_ixbrl_computation_id
    ),
    'test_run_key', p_test_run_key,
    'already_existed', false
  );
END;
$$;
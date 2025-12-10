import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Companies House API endpoints
const CH_ENDPOINTS = {
  test: 'https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway',
  production: 'https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CH_TEST_API_KEY = Deno.env.get('CH_TEST_API_KEY');
    const CH_PROD_API_KEY = Deno.env.get('CH_PROD_API_KEY');

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { filingId, environment = 'test' } = await req.json();

    if (!filingId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing filingId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate environment
    if (!['test', 'production'].includes(environment)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid environment. Must be "test" or "production"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key for environment
    const apiKey = environment === 'production' ? CH_PROD_API_KEY : CH_TEST_API_KEY;
    if (!apiKey) {
      console.error(`No API key configured for environment: ${environment}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Companies House API key not configured for ${environment} environment` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch filing with company and organization details
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        companies(
          id,
          company_number,
          company_name,
          companies_house_auth_code,
          address_line_1,
          address_line_2,
          city,
          postcode,
          country
        )
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      console.error('Filing not found:', filingError);
      return new Response(
        JSON.stringify({ success: false, message: 'Filing not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this organization
    const { data: orgUser, error: orgError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', filing.organization_id)
      .single();

    if (orgError || !orgUser) {
      console.error('Organization access error:', orgError);
      return new Response(
        JSON.stringify({ success: false, message: 'Access denied to organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get presenter details from organization settings
    const { data: orgCH, error: orgCHError } = await supabase
      .from('organization_integrations_companies_house')
      .select('presenter_id, presenter_name, presenter_email')
      .eq('organization_id', filing.organization_id)
      .maybeSingle();

    if (orgCHError) {
      console.error('Failed to fetch presenter details:', orgCHError);
    }

    // Validate required fields
    const company = filing.companies;
    const validationErrors: string[] = [];

    if (!company?.company_number) {
      validationErrors.push('Company number is not set');
    }
    if (!company?.companies_house_auth_code) {
      validationErrors.push('Company authentication code is not set');
    }
    if (!orgCH?.presenter_id) {
      validationErrors.push('Presenter ID is not configured');
    }
    if (!orgCH?.presenter_email) {
      validationErrors.push('Presenter email is not configured');
    }

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Validation failed',
          errors: validationErrors.map(e => ({ code: 'VALIDATION', description: e }))
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the XML payload based on filing type
    let xmlPayload: string;
    let transactionId: string;

    if (filing.filing_type === 'CS01') {
      const result = buildCS01XML({
        companyNumber: company.company_number,
        companyName: company.company_name,
        madeUpToDate: filing.period_end || filing.filing_data?.confirmation_statement?.made_up_to_date,
        presenter: {
          id: orgCH?.presenter_id || '',
          name: orgCH?.presenter_name || orgCH?.presenter_id || '',
          email: orgCH?.presenter_email || '',
        },
        authCode: company.companies_house_auth_code,
        filingData: filing.filing_data,
      });
      xmlPayload = result.xml;
      transactionId = result.transactionId;
    } else if (filing.filing_type === 'AA' || filing.filing_type === 'companies_house_accounts') {
      // Accounts filing - generate iXBRL
      // For now, return a stub response as full iXBRL requires workpaper integration
      const result = buildAccountsSubmission({
        companyNumber: company.company_number,
        companyName: company.company_name,
        periodStart: filing.period_start,
        periodEnd: filing.period_end,
        presenter: {
          id: orgCH?.presenter_id || '',
          name: orgCH?.presenter_name || orgCH?.presenter_id || '',
          email: orgCH?.presenter_email || '',
        },
        authCode: company.companies_house_auth_code,
        filingData: filing.filing_data,
        registeredOffice: {
          line1: company.address_line_1 || '',
          line2: company.address_line_2 || '',
          city: company.city || '',
          postcode: company.postcode || '',
          country: company.country || 'United Kingdom',
        },
      });
      xmlPayload = result.xml;
      transactionId = result.transactionId;
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Unsupported filing type: ${filing.filing_type}. Supported: CS01, AA (accounts).`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('filing_submissions')
      .insert({
        filing_id: filingId,
        organization_id: filing.organization_id,
        environment,
        filing_type: filing.filing_type,
        request_payload: xmlPayload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Failed to create submission record:', submissionError);
    }

    // Submit to Companies House
    console.log(`Submitting ${filing.filing_type} to CH (${environment})...`);
    
    const chEndpoint = CH_ENDPOINTS[environment as keyof typeof CH_ENDPOINTS];
    const authString = btoa(`${apiKey}:`);
    
    let chResponse: Response;
    let responseText: string;
    
    try {
      chResponse = await fetch(chEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/xml',
        },
        body: xmlPayload,
      });
      
      responseText = await chResponse.text();
      console.log(`CH Response status: ${chResponse.status}`);
    } catch (fetchError: any) {
      console.error('Failed to call Companies House API:', fetchError);
      
      // Update submission with error
      if (submission?.id) {
        await supabase
          .from('filing_submissions')
          .update({
            status: 'error',
            error_message: fetchError.message,
            response_status_code: 0,
          })
          .eq('id', submission.id);
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          status: 'error', 
          message: `Failed to connect to Companies House: ${fetchError.message}`,
          submissionId: submission?.id,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the response
    const parseResult = parseCS01Response(responseText);
    
    // Determine final status
    let finalStatus: string;
    if (parseResult.success) {
      finalStatus = parseResult.status === 'accepted' ? 'accepted' : 'submitted';
    } else {
      finalStatus = chResponse.status >= 400 ? 'rejected' : 'error';
    }

    // Update submission record
    if (submission?.id) {
      await supabase
        .from('filing_submissions')
        .update({
          response_status_code: chResponse.status,
          response_payload: responseText,
          ch_transaction_id: parseResult.transactionId || transactionId,
          status: finalStatus,
          error_message: parseResult.message,
        })
        .eq('id', submission.id);
    }

    // Update filing record
    const filingUpdate: Record<string, any> = {
      environment,
      submitted_at: new Date().toISOString(),
      last_submission_error: parseResult.success ? null : parseResult.message,
    };

    if (parseResult.success) {
      if (parseResult.status === 'accepted') {
        filingUpdate.status = 'filed';
        filingUpdate.ch_transaction_id = parseResult.transactionId || parseResult.submissionNumber;
        filingUpdate.accepted_at = new Date().toISOString();
        filingUpdate.filing_reference = parseResult.submissionNumber;
        filingUpdate.filed_at = new Date().toISOString();
        filingUpdate.is_locked = true;
      } else {
        filingUpdate.status = 'submitted';
        filingUpdate.ch_transaction_id = parseResult.transactionId;
      }
    }

    await supabase
      .from('filings')
      .update(filingUpdate)
      .eq('id', filingId);

    // Log audit event
    await supabase
      .from('audit_log')
      .insert({
        organization_id: filing.organization_id,
        entity_type: 'filing',
        entity_id: filingId,
        action: 'ch_submit',
        user_id: user.id,
        metadata: {
          environment,
          filing_type: filing.filing_type,
          status: finalStatus,
          transaction_id: parseResult.transactionId,
          submission_id: submission?.id,
        },
      });

    console.log(`Filing submission complete: ${finalStatus}`);

    return new Response(
      JSON.stringify({
        success: parseResult.success,
        submissionId: submission?.id,
        transactionId: parseResult.transactionId || transactionId,
        status: finalStatus,
        message: parseResult.message,
        errors: parseResult.errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in ch-submit:', error);
    return new Response(
      JSON.stringify({ success: false, status: 'error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============ Helper Functions ============

interface CS01BuildInput {
  companyNumber: string;
  companyName: string;
  madeUpToDate: string;
  presenter: {
    id: string;
    name: string;
    email: string;
  };
  authCode: string;
  filingData: any;
}

interface AccountsBuildInput {
  companyNumber: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  presenter: {
    id: string;
    name: string;
    email: string;
  };
  authCode: string;
  filingData: any;
  registeredOffice: {
    line1: string;
    line2: string;
    city: string;
    postcode: string;
    country: string;
  };
}

function buildAccountsSubmission(input: AccountsBuildInput): { xml: string; transactionId: string } {
  const transactionId = `AA-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();
  const filingData = input.filingData || {};
  
  // Extract balance sheet data from filing_data (mapped from workpaper)
  const balanceSheet = filingData.balance_sheet || {};
  const profitLoss = filingData.profit_loss || {};
  const notes = filingData.notes || {};
  const approval = filingData.approval || {};
  const accountsType = filingData.accounts_type || 'micro'; // micro or small
  
  // Calculate totals for balance sheet
  const fixedAssets = Number(balanceSheet.tangible_assets || 0) + 
                      Number(balanceSheet.intangible_assets || 0) + 
                      Number(balanceSheet.investments || 0);
  const currentAssets = Number(balanceSheet.stock || 0) + 
                        Number(balanceSheet.debtors || 0) + 
                        Number(balanceSheet.cash_at_bank || 0);
  const totalAssets = fixedAssets + currentAssets;
  const creditorsWithin = Number(balanceSheet.creditors_within_one_year || 0);
  const creditorsAfter = Number(balanceSheet.creditors_after_one_year || 0);
  const netAssets = totalAssets - creditorsWithin - creditorsAfter;
  const shareCapital = Number(balanceSheet.share_capital || 0);
  const retainedEarnings = Number(balanceSheet.retained_earnings || 0);
  const totalEquity = shareCapital + retainedEarnings;
  
  // Build a stub iXBRL document for CH sandbox
  // In production, this would use a proper iXBRL generator (third-party or full implementation)
  const periodStartFormatted = input.periodStart ? input.periodStart.split('T')[0] : '';
  const periodEndFormatted = input.periodEnd ? input.periodEnd.split('T')[0] : '';
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompaniesHouse</Class>
      <Qualifier>request</Qualifier>
      <Function>AnnualAccounts</Function>
      <TransactionID>${escapeXml(transactionId)}</TransactionID>
      <CorrelationID/>
      <ResponseEndPoint PollInterval="10"/>
      <Transformation>XML</Transformation>
      <GatewayTest>0</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(input.presenter.id)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value/>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${escapeXml(input.presenter.email)}</EmailAddress>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="CompanyNumber">${escapeXml(input.companyNumber)}</Key>
      <Key Type="CompanyAuthCode">${escapeXml(input.authCode)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body>
    <AnnualAccounts xmlns="http://xmlgw.companieshouse.gov.uk/v1-0/schema">
      <CompanyNumber>${escapeXml(input.companyNumber)}</CompanyNumber>
      <CompanyName>${escapeXml(input.companyName)}</CompanyName>
      <AccountsType>${accountsType === 'small' ? 'SmallCompany' : 'MicroEntity'}</AccountsType>
      <AccountingStandard>${accountsType === 'small' ? 'FRS102-1A' : 'FRS105'}</AccountingStandard>
      
      <PeriodStart>${periodStartFormatted}</PeriodStart>
      <PeriodEnd>${periodEndFormatted}</PeriodEnd>
      
      <RegisteredOffice>
        <Line1>${escapeXml(input.registeredOffice.line1)}</Line1>
        <Line2>${escapeXml(input.registeredOffice.line2)}</Line2>
        <City>${escapeXml(input.registeredOffice.city)}</City>
        <PostCode>${escapeXml(input.registeredOffice.postcode)}</PostCode>
        <Country>${escapeXml(input.registeredOffice.country)}</Country>
      </RegisteredOffice>
      
      <BalanceSheet>
        <FixedAssets>
          <TangibleAssets>${balanceSheet.tangible_assets || 0}</TangibleAssets>
          <IntangibleAssets>${balanceSheet.intangible_assets || 0}</IntangibleAssets>
          <Investments>${balanceSheet.investments || 0}</Investments>
          <Total>${fixedAssets}</Total>
        </FixedAssets>
        <CurrentAssets>
          <Stock>${balanceSheet.stock || 0}</Stock>
          <Debtors>${balanceSheet.debtors || 0}</Debtors>
          <CashAtBank>${balanceSheet.cash_at_bank || 0}</CashAtBank>
          <Total>${currentAssets}</Total>
        </CurrentAssets>
        <TotalAssets>${totalAssets}</TotalAssets>
        <CreditorsWithinOneYear>${creditorsWithin}</CreditorsWithinOneYear>
        <NetCurrentAssets>${currentAssets - creditorsWithin}</NetCurrentAssets>
        <TotalAssetsLessCurrentLiabilities>${totalAssets - creditorsWithin}</TotalAssetsLessCurrentLiabilities>
        <CreditorsAfterOneYear>${creditorsAfter}</CreditorsAfterOneYear>
        <NetAssets>${netAssets}</NetAssets>
        <CapitalAndReserves>
          <CalledUpShareCapital>${shareCapital}</CalledUpShareCapital>
          <SharePremium>${balanceSheet.share_premium || 0}</SharePremium>
          <ProfitAndLossReserve>${retainedEarnings}</ProfitAndLossReserve>
          <Total>${totalEquity}</Total>
        </CapitalAndReserves>
      </BalanceSheet>
      
      ${accountsType === 'small' ? `
      <ProfitAndLoss>
        <Turnover>${profitLoss.turnover || 0}</Turnover>
        <CostOfSales>${profitLoss.cost_of_sales || 0}</CostOfSales>
        <GrossProfit>${(profitLoss.turnover || 0) - (profitLoss.cost_of_sales || 0)}</GrossProfit>
        <AdministrativeExpenses>${profitLoss.administrative_expenses || 0}</AdministrativeExpenses>
        <OperatingProfit>${(profitLoss.turnover || 0) - (profitLoss.cost_of_sales || 0) - (profitLoss.administrative_expenses || 0)}</OperatingProfit>
        <InterestReceivable>${profitLoss.interest_receivable || 0}</InterestReceivable>
        <InterestPayable>${profitLoss.interest_payable || 0}</InterestPayable>
        <ProfitBeforeTax>${profitLoss.profit_before_tax || 0}</ProfitBeforeTax>
        <TaxCharge>${profitLoss.corporation_tax || 0}</TaxCharge>
        <ProfitAfterTax>${(profitLoss.profit_before_tax || 0) - (profitLoss.corporation_tax || 0)}</ProfitAfterTax>
      </ProfitAndLoss>
      ` : ''}
      
      <Notes>
        <AccountingPolicies>
          <GoingConcern>${notes.going_concern ? 'true' : 'false'}</GoingConcern>
          <TurnoverPolicy>${escapeXml(notes.turnover_policy || 'Turnover represents amounts receivable for goods and services provided in the normal course of business.')}</TurnoverPolicy>
          <DepreciationPolicy>${escapeXml(notes.depreciation_policy || 'Depreciation is provided on all tangible fixed assets at rates calculated to write off the cost over their expected useful lives.')}</DepreciationPolicy>
        </AccountingPolicies>
        <AverageEmployees>${notes.average_employees || 0}</AverageEmployees>
        <DirectorsAdvances>
          <Exist>${notes.directors_advances_exist ? 'true' : 'false'}</Exist>
          ${notes.directors_advances_exist ? `<Details>${escapeXml(notes.directors_advances_details || '')}</Details>` : ''}
        </DirectorsAdvances>
        <RelatedPartyTransactions>
          <Exist>${notes.related_party_transactions_exist ? 'true' : 'false'}</Exist>
          ${notes.related_party_transactions_exist ? `<Details>${escapeXml(notes.related_party_details || '')}</Details>` : ''}
        </RelatedPartyTransactions>
        <Guarantees>
          <Exist>${notes.guarantees_exist ? 'true' : 'false'}</Exist>
          ${notes.guarantees_exist ? `<Details>${escapeXml(notes.guarantees_details || '')}</Details>` : ''}
        </Guarantees>
      </Notes>
      
      <Approval>
        <ApprovedByBoard>${approval.approved_by_board ? 'true' : 'false'}</ApprovedByBoard>
        <ApprovalDate>${approval.approval_date || new Date().toISOString().split('T')[0]}</ApprovalDate>
        <SignatoryName>${escapeXml(approval.signatory_name || '')}</SignatoryName>
        <SignatoryRole>${escapeXml(approval.signatory_role || 'Director')}</SignatoryRole>
      </Approval>
      
      <PresenterDetails>
        <PresenterID>${escapeXml(input.presenter.id)}</PresenterID>
        <PresenterName>${escapeXml(input.presenter.name)}</PresenterName>
        <PresenterEmail>${escapeXml(input.presenter.email)}</PresenterEmail>
      </PresenterDetails>
      
      <Timestamp>${timestamp}</Timestamp>
    </AnnualAccounts>
  </Body>
</GovTalkMessage>`;

  return { xml, transactionId };
}

function buildCS01XML(input: CS01BuildInput): { xml: string; transactionId: string } {
  const transactionId = `CS01-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();
  const filingData = input.filingData || {};
  const confirmations = filingData.confirmation_statement || {};

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompaniesHouse</Class>
      <Qualifier>request</Qualifier>
      <Function>ConfirmationStatement</Function>
      <TransactionID>${escapeXml(transactionId)}</TransactionID>
      <CorrelationID/>
      <ResponseEndPoint PollInterval="10"/>
      <Transformation>XML</Transformation>
      <GatewayTest>0</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(input.presenter.id)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value/>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${escapeXml(input.presenter.email)}</EmailAddress>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="CompanyNumber">${escapeXml(input.companyNumber)}</Key>
      <Key Type="CompanyAuthCode">${escapeXml(input.authCode)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body>
    <ConfirmationStatement xmlns="http://xmlgw.companieshouse.gov.uk/v1-0/schema">
      <CompanyNumber>${escapeXml(input.companyNumber)}</CompanyNumber>
      <CompanyName>${escapeXml(input.companyName)}</CompanyName>
      <MadeUpDate>${input.madeUpToDate}</MadeUpDate>
      <ConfirmationStatementDate>${new Date().toISOString().split('T')[0]}</ConfirmationStatementDate>
      
      <Confirmations>
        <TradingStatusUnchanged>${confirmations.trading_status_unchanged ? 'true' : 'false'}</TradingStatusUnchanged>
        <StatementOfCapitalConfirmed>${confirmations.statement_of_capital_correct ? 'true' : 'false'}</StatementOfCapitalConfirmed>
        <ShareholderInformationConfirmed>true</ShareholderInformationConfirmed>
        <PSCInformationConfirmed>true</PSCInformationConfirmed>
        <OfficerInformationConfirmed>true</OfficerInformationConfirmed>
        <SicCodesConfirmed>true</SicCodesConfirmed>
        <RegisteredOfficeConfirmed>true</RegisteredOfficeConfirmed>
      </Confirmations>
      
      <PresenterDetails>
        <PresenterID>${escapeXml(input.presenter.id)}</PresenterID>
        <PresenterName>${escapeXml(input.presenter.name)}</PresenterName>
        <PresenterEmail>${escapeXml(input.presenter.email)}</PresenterEmail>
      </PresenterDetails>
      
      <Timestamp>${timestamp}</Timestamp>
    </ConfirmationStatement>
  </Body>
</GovTalkMessage>`;

  return { xml, transactionId };
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface CS01ParseResult {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
  message?: string;
  errors?: Array<{ code: string; description: string }>;
  submissionNumber?: string;
}

function parseCS01Response(responseXml: string): CS01ParseResult {
  try {
    const getElement = (xml: string, tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const match = xml.match(regex);
      return match ? match[1] : null;
    };

    const getElements = (xml: string, tag: string): string[] => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
      const matches = xml.matchAll(regex);
      return Array.from(matches).map(m => m[1]);
    };

    // Check for errors
    const errorCodes = getElements(responseXml, 'ErrorCode');
    const errorDescriptions = getElements(responseXml, 'ErrorDescription');
    
    if (errorCodes.length > 0) {
      const errors = errorCodes.map((code, i) => ({
        code,
        description: errorDescriptions[i] || 'Unknown error',
      }));
      
      return {
        success: false,
        status: 'rejected',
        message: errors[0]?.description || 'Submission rejected',
        errors,
      };
    }

    const qualifier = getElement(responseXml, 'Qualifier');
    const transactionId = getElement(responseXml, 'TransactionID');
    const submissionNumber = getElement(responseXml, 'SubmissionNumber');
    
    if (qualifier === 'acknowledgement' || qualifier === 'response') {
      return {
        success: true,
        status: submissionNumber ? 'accepted' : 'pending',
        transactionId: transactionId || undefined,
        submissionNumber: submissionNumber || undefined,
        message: submissionNumber ? 'Confirmation Statement accepted' : 'Submission received',
      };
    }

    if (qualifier === 'poll') {
      return {
        success: true,
        status: 'pending',
        transactionId: transactionId || undefined,
        message: 'Submission is being processed',
      };
    }

    return {
      success: false,
      status: 'error',
      message: 'Unexpected response format',
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: `Failed to parse response: ${err.message}`,
    };
  }
}

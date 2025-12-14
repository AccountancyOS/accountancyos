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

    // === SERVER-SIDE SUBMISSION GUARD ===
    // Validate submission integrity for ACCOUNTS filings
    const filingTypeForValidation = filing.filing_type === 'AA' || 
                                    filing.filing_type === 'companies_house_accounts' || 
                                    filing.filing_type === 'ACCOUNTS_CH' 
                                    ? 'ACCOUNTS_CH' : null;
    
    if (filingTypeForValidation) {
      const { data: integrityCheck, error: integrityError } = await supabase.rpc(
        'validate_submission_integrity',
        { p_filing_id: filingId, p_filing_type: filingTypeForValidation }
      );

      if (integrityError) {
        console.error('[ch-submit] Integrity check error:', integrityError);
        return new Response(
          JSON.stringify({ success: false, message: 'Submission integrity check failed', error: integrityError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const integrity = integrityCheck as { valid: boolean; errors: string[] } | null;
      if (integrity && !integrity.valid) {
        console.error('[ch-submit] Submission blocked by integrity check:', integrity.errors);
        
        // Log the blocked submission attempt
        await supabase.from('filing_submissions').insert({
          filing_id: filingId,
          organization_id: filing.organization_id,
          environment,
          status: 'blocked',
          error_message: `Submission blocked: ${integrity.errors.join(', ')}`,
          request_payload: { blocked_reason: 'integrity_check_failed', errors: integrity.errors }
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Submission blocked by integrity check',
            errors: integrity.errors.map(e => ({ code: 'INTEGRITY', description: e }))
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    // Determine filing type and build appropriate payload
    let xmlPayload: string;
    let transactionId: string;
    let ixbrlContent: string | null = null;
    let ixbrlHash: string | null = null;

    const filingType = filing.filing_type;

    if (filingType === 'CS01') {
      // Confirmation Statement
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

    } else if (filingType === 'AA' || filingType === 'companies_house_accounts' || filingType === 'ACCOUNTS_CH') {
      // Accounts filing - requires ACCOUNTS approval and iXBRL artefact

      // Check for ACCOUNTS approval
      const { data: approval } = await supabase
        .from('filing_approvals')
        .select('*')
        .eq('filing_id', filingId)
        .eq('approval_scope', 'ACCOUNTS')
        .is('revoked_at', null)
        .single();

      if (!approval) {
        console.error('[ch-submit] ACCOUNTS approval required');
        return new Response(
          JSON.stringify({ success: false, message: 'ACCOUNTS approval required before submission' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Get iXBRL accounts artefact (must already exist - no regeneration)
      const { data: ixbrlArtefact } = await supabase
        .from('filing_artefacts')
        .select('*')
        .eq('filing_id', filingId)
        .eq('artefact_type', 'IXBRL_ACCOUNTS')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!ixbrlArtefact) {
        console.error('[ch-submit] iXBRL accounts artefact not found');
        return new Response(
          JSON.stringify({ success: false, message: 'iXBRL accounts artefact not found - generate filing documents first' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      ixbrlContent = ixbrlArtefact.content;
      ixbrlHash = ixbrlArtefact.content_hash;

      // Build accounts submission XML with embedded iXBRL
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
        ixbrlContent: ixbrlContent!,
        accountsType: filing.filing_data?.accounts_type || 'micro',
      });
      xmlPayload = result.xml;
      transactionId = result.transactionId;

    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Unsupported filing type: ${filingType}. Supported: CS01, AA, companies_house_accounts, ACCOUNTS_CH.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check idempotency
    const snapshotHash = filing.accounts_snapshot_id ? 
      (await supabase.from('accounts_model_snapshots').select('snapshot_hash').eq('id', filing.accounts_snapshot_id).single()).data?.snapshot_hash 
      : null;
    
    const idempotencyKey = `ch:${filingType}:${filing.company_id}:${filing.period_end}:${snapshotHash || transactionId}`;

    const { data: existingSubmission } = await supabase
      .from('filing_submissions')
      .select('id, ch_transaction_id, status')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['pending', 'accepted', 'submitted'])
      .maybeSingle();

    if (existingSubmission) {
      console.log('[ch-submit] Duplicate submission detected');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Filing already submitted with this data',
          existingSubmissionId: existingSubmission.id,
          existingTransactionId: existingSubmission.ch_transaction_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('filing_submissions')
      .insert({
        filing_id: filingId,
        organization_id: filing.organization_id,
        environment,
        provider: 'companies_house',
        filing_type: filingType,
        request_payload: xmlPayload,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Failed to create submission record:', submissionError);
    }

    // Update filing status to submitting
    await supabase
      .from('filings')
      .update({ status: 'submitting' })
      .eq('id', filingId);

    // Submit to Companies House
    console.log(`[ch-submit] Submitting ${filingType} to CH (${environment})...`);
    
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
      console.log(`[ch-submit] CH Response status: ${chResponse.status}`);
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

      await supabase
        .from('filings')
        .update({ status: 'submission_failed' })
        .eq('id', filingId);

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
    const parseResult = parseCHResponse(responseText);
    
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
    } else {
      filingUpdate.status = 'submission_failed';
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
          filing_type: filingType,
          status: finalStatus,
          transaction_id: parseResult.transactionId,
          submission_id: submission?.id,
          ixbrl_hash: ixbrlHash,
        },
      });

    console.log(`[ch-submit] Filing submission complete: ${finalStatus}`);

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
  ixbrlContent: string;
  accountsType: 'micro' | 'small';
}

function buildAccountsSubmission(input: AccountsBuildInput): { xml: string; transactionId: string } {
  const transactionId = `AA-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();
  
  const periodStartFormatted = input.periodStart ? input.periodStart.split('T')[0] : '';
  const periodEndFormatted = input.periodEnd ? input.periodEnd.split('T')[0] : '';
  
  // Encode iXBRL content as base64 for attachment
  const ixbrlBase64 = btoa(unescape(encodeURIComponent(input.ixbrlContent)));
  
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
      <GatewayTest>${input.presenter.id.startsWith('TEST') ? '1' : '0'}</GatewayTest>
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
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/v1-0/schema">
      <FormHeader>
        <CompanyNumber>${escapeXml(input.companyNumber)}</CompanyNumber>
        <CompanyName>${escapeXml(input.companyName)}</CompanyName>
        <FormType>${input.accountsType === 'small' ? 'AA-SMALL' : 'AA-MICRO'}</FormType>
      </FormHeader>
      <DateSigned>${new Date().toISOString().split('T')[0]}</DateSigned>
      <Document>
        <Accounts>
          <AccountsType>${input.accountsType === 'small' ? 'SmallCompany' : 'MicroEntity'}</AccountsType>
          <AccountingStandard>${input.accountsType === 'small' ? 'FRS102-1A' : 'FRS105'}</AccountingStandard>
          <PeriodStart>${periodStartFormatted}</PeriodStart>
          <PeriodEnd>${periodEndFormatted}</PeriodEnd>
          <IXBRL>
            <Encoding>base64</Encoding>
            <ContentType>text/html</ContentType>
            <Content>${ixbrlBase64}</Content>
          </IXBRL>
        </Accounts>
      </Document>
      <PresenterDetails>
        <PresenterID>${escapeXml(input.presenter.id)}</PresenterID>
        <PresenterName>${escapeXml(input.presenter.name)}</PresenterName>
        <PresenterEmail>${escapeXml(input.presenter.email)}</PresenterEmail>
      </PresenterDetails>
      <Timestamp>${timestamp}</Timestamp>
    </FormSubmission>
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

interface CHParseResult {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
  message?: string;
  errors?: Array<{ code: string; description: string }>;
  submissionNumber?: string;
}

function parseCHResponse(responseXml: string): CHParseResult {
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
        message: submissionNumber ? 'Submission accepted' : 'Submission received',
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

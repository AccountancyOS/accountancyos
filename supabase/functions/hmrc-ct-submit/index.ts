import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.2";

/**
 * HMRC CT600 Submit Edge Function
 * Submits CT600 to HMRC Transaction Engine and queues polling job
 * No polling loops - queue-driven architecture
 * Uses fast-xml-parser for namespace-tolerant XML parsing
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC Transaction Engine endpoints (not MTD REST API)
const HMRC_CT_ENDPOINTS = {
  test: 'https://test-transaction-engine.tax.service.gov.uk/submission',
  production: 'https://transaction-engine.tax.service.gov.uk/submission',
};

// Maximum poll attempts before timeout
const MAX_POLL_ATTEMPTS = 100;

interface SubmissionRequest {
  filingId: string;
  environment: 'test' | 'production';
}

// ============= XML UTILITIES =============

function escapeXmlSafe(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function encodeBase64Utf8(str: string): string {
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

function md5HashSync(str: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }
  function add32(a: number, b: number): number {
    return (a + b) & 0xFFFFFFFF;
  }
  function md5blk(s: string): number[] {
    const md5blks: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + 
                        (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  let n = str.length;
  let state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;
  for (i = 64; i <= str.length; i += 64) {
    md5cycle(state, md5blk(str.substring(i - 64, i)));
  }
  str = str.substring(i - 64);
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < str.length; i++) {
    tail[i >> 2] |= str.charCodeAt(i) << ((i % 4) << 3);
  }
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    for (i = 0; i < 16; i++) tail[i] = 0;
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  const hex = '0123456789abcdef';
  let result = '';
  for (i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result += hex.charAt((state[i] >> (j * 8 + 4)) & 0x0F) + 
                hex.charAt((state[i] >> (j * 8)) & 0x0F);
    }
  }
  return result;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============= XML PARSING (fast-xml-parser) =============

interface GovTalkResponse {
  qualifier: 'acknowledgement' | 'response' | 'error';
  correlationId?: string;
  pollInterval?: number;
  transactionId?: string;
  receiptReference?: string;
  errors?: Array<{ code: string; message: string }>;
}

/**
 * Safely extract a value from parsed XML object, handling namespaced keys
 */
function safeGet(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    // Try exact key first
    if (obj[key] !== undefined) return obj[key];
    // Try with namespace prefix removed
    for (const k of Object.keys(obj)) {
      if (k.endsWith(`:${key}`) || k === key) {
        return obj[k];
      }
    }
  }
  return undefined;
}

/**
 * Parse GovTalk response using fast-xml-parser
 * Namespace-tolerant, handles all GovTalk response types
 */
function parseGovTalkResponse(responseXml: string): GovTalkResponse {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: true,
      trimValues: true,
    });

    const parsed = parser.parse(responseXml);
    
    // Navigate to GovTalkMessage (handles namespace variations)
    const govTalkMsg = safeGet(parsed, 'GovTalkMessage', 'GovTalkMessage:GovTalkMessage') || parsed;
    const header = safeGet(govTalkMsg, 'Header') || {};
    const messageDetails = safeGet(header, 'MessageDetails') || {};
    const govTalkDetails = safeGet(govTalkMsg, 'GovTalkDetails') || {};
    
    // Extract qualifier
    const qualifierRaw = safeGet(messageDetails, 'Qualifier');
    const qualifier = (typeof qualifierRaw === 'string' ? qualifierRaw.toLowerCase() : 'error') as 'acknowledgement' | 'response' | 'error';
    
    // Extract correlation ID
    const correlationId = safeGet(messageDetails, 'CorrelationID') as string | undefined;
    
    // Extract poll interval (for acknowledgements)
    const pollIntervalRaw = safeGet(messageDetails, 'PollInterval');
    const pollInterval = pollIntervalRaw ? parseInt(String(pollIntervalRaw), 10) : undefined;
    
    // Extract transaction ID
    const transactionId = safeGet(messageDetails, 'TransactionID') as string | undefined;
    
    // Extract receipt reference (for successful responses)
    const receiptReference = safeGet(govTalkDetails, 'ReceiptReference') ||
                             safeGet(govTalkDetails, 'IRmarkReceipt') as string | undefined;
    
    // Extract errors from GovTalkErrors and/or Error elements
    const errors: Array<{ code: string; message: string }> = [];
    
    // Check GovTalkDetails for errors
    const govTalkErrors = safeGet(govTalkDetails, 'GovTalkErrors', 'GovTalkError');
    if (govTalkErrors) {
      const errorList = Array.isArray(govTalkErrors) ? govTalkErrors : [govTalkErrors];
      for (const err of errorList) {
        if (err.Error) {
          const errItems = Array.isArray(err.Error) ? err.Error : [err.Error];
          for (const e of errItems) {
            errors.push({
              code: String(safeGet(e, 'Number', 'Code', 'RaisedBy') || 'UNKNOWN'),
              message: String(safeGet(e, 'Text', 'Message', 'Type') || 'Unknown error')
            });
          }
        }
      }
    }
    
    // Also check Body for errors
    const body = safeGet(govTalkMsg, 'Body') || {};
    const bodyErrors = safeGet(body, 'ErrorResponse', 'Errors', 'Error');
    if (bodyErrors) {
      const errItems = Array.isArray(bodyErrors) ? bodyErrors : [bodyErrors];
      for (const e of errItems) {
        errors.push({
          code: String(safeGet(e, 'Number', 'Code') || 'UNKNOWN'),
          message: String(safeGet(e, 'Text', 'Message') || 'Unknown error')
        });
      }
    }
    
    return {
      qualifier: errors.length > 0 && qualifier !== 'response' ? 'error' : qualifier,
      correlationId,
      pollInterval,
      transactionId,
      receiptReference,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('[parseGovTalkResponse] Parse error:', error);
    return {
      qualifier: 'error',
      errors: [{ code: 'XML_PARSE_ERROR', message: String(error) }]
    };
  }
}

// ============= GOVTALK ENVELOPE BUILDER =============

function buildGovTalkSubmitEnvelope(
  gatewayId: string,
  gatewayPassword: string,
  utr: string,
  companyName: string,
  companyNumber: string,
  periodStart: string,
  periodEnd: string,
  ct600Content: string,
  ixbrlAccounts: string,
  ixbrlComputation: string,
  isAmendment: boolean,
  originalReference?: string
): string {
  const transactionId = `CT600-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const passwordHash = md5HashSync(gatewayPassword);
  const accountsBase64 = encodeBase64Utf8(ixbrlAccounts);
  const computationBase64 = encodeBase64Utf8(ixbrlComputation);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <TransactionID>${escapeXmlSafe(transactionId)}</TransactionID>
      <AuditID></AuditID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXmlSafe(gatewayId)}</SenderID>
        <Authentication>
          <Method>MD5</Method>
          <Role>principal</Role>
          <Value>${passwordHash}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXmlSafe(utr)}</Key>
    </Keys>
    <TargetDetails>
      <Organisation>HMRC</Organisation>
    </TargetDetails>
    <ChannelRouting>
      <Channel>
        <URI>AccountancyOS</URI>
        <Product>AccountancyOS</Product>
        <Version>1.0.0</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>
  <Body>
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys>
          <Key Type="UTR">${escapeXmlSafe(utr)}</Key>
        </Keys>
        <PeriodStart>${formatDate(periodStart)}</PeriodStart>
        <PeriodEnd>${formatDate(periodEnd)}</PeriodEnd>
        <Principal>
          <Contact>
            <Name>
              <Ttl>Mr</Ttl>
              <Fore>Director</Fore>
              <Sur>Company</Sur>
            </Name>
          </Contact>
        </Principal>
        <IRmark Type="generic">0</IRmark>
        <Sender>Agent</Sender>
      </IRheader>
      <CompanyTaxReturn>
        <CompanyInformation>
          <CompanyName>${escapeXmlSafe(companyName)}</CompanyName>
          <RegistrationNumber>${escapeXmlSafe(companyNumber)}</RegistrationNumber>
          <Reference>${escapeXmlSafe(utr)}</Reference>
        </CompanyInformation>
        ${ct600Content}
        <Accounts>
          <AttachedAccounts>
            <Encoding>base64</Encoding>
            <Content>${accountsBase64}</Content>
          </AttachedAccounts>
        </Accounts>
        <Computations>
          <AttachedComputations>
            <Encoding>base64</Encoding>
            <Content>${computationBase64}</Content>
          </AttachedComputations>
        </Computations>
        ${isAmendment ? `
        <Amendment>
          <OriginalSubmissionReference>${escapeXmlSafe(originalReference || '')}</OriginalSubmissionReference>
          <Reason>Correction</Reason>
        </Amendment>` : ''}
        <Declaration>
          <DeclarationStatus>Director</DeclarationStatus>
          <DeclarationName>Director</DeclarationName>
        </Declaration>
      </CompanyTaxReturn>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { filingId, environment = 'test' }: SubmissionRequest = await req.json();
    console.log(`[hmrc-ct-submit] Starting CT600 submission for filing ${filingId} in ${environment} mode`);

    // Check for HMRC Gateway credentials
    const gatewayId = Deno.env.get('HMRC_CT_GATEWAY_ID');
    const gatewayPassword = Deno.env.get('HMRC_CT_GATEWAY_PASSWORD');

    if (!gatewayId || !gatewayPassword) {
      console.error('[hmrc-ct-submit] HMRC CT Gateway credentials not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'HMRC CT Gateway credentials not configured',
          details: 'Set HMRC_CT_GATEWAY_ID and HMRC_CT_GATEWAY_PASSWORD secrets'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get filing with related data
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        company:company_id(
          company_name, company_number, utr,
          address_line_1, address_line_2, city, postcode, country
        ),
        ct_snapshot:ct_snapshot_id(*)
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      console.error('[hmrc-ct-submit] Filing not found:', filingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Filing not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Validate submission integrity
    const { data: integrityCheck, error: integrityError } = await supabase.rpc(
      'validate_submission_integrity',
      { p_filing_id: filingId, p_filing_type: 'CT600_HMRC' }
    );

    if (integrityError) {
      console.error('[hmrc-ct-submit] Integrity check error:', integrityError);
      return new Response(
        JSON.stringify({ success: false, error: 'Submission integrity check failed', details: integrityError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const integrity = integrityCheck as { valid: boolean; errors: string[] } | null;
    if (integrity && !integrity.valid) {
      console.error('[hmrc-ct-submit] Submission blocked:', integrity.errors);
      return new Response(
        JSON.stringify({ success: false, error: 'Submission blocked by integrity check', errors: integrity.errors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get CT600 XML content artefact
    const { data: ct600Artefact } = await supabase
      .from('filing_artefacts')
      .select('*')
      .eq('filing_id', filingId)
      .eq('artefact_type', 'CT600_XML')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!ct600Artefact) {
      return new Response(
        JSON.stringify({ success: false, error: 'CT600 XML artefact not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get iXBRL artefacts
    const { data: ixbrlArtefacts } = await supabase
      .from('filing_artefacts')
      .select('*')
      .eq('filing_id', filingId)
      .in('artefact_type', ['IXBRL_ACCOUNTS', 'IXBRL_CT_COMPUTATION']);

    const ixbrlAccounts = ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_ACCOUNTS');
    const ixbrlComputation = ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_CT_COMPUTATION');

    if (!ixbrlAccounts || !ixbrlComputation) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing iXBRL artefacts' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check idempotency
    const snapshotHash = filing.ct_snapshot?.snapshot_hash || 'unknown';
    const idempotencyKey = `hmrc_ct:${filing.company_id}:${filing.period_end}:${snapshotHash}`;

    const { data: existingSubmission } = await supabase
      .from('filing_submissions')
      .select('id, correlation_id, status')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['pending', 'submitted', 'polling', 'accepted'])
      .limit(1)
      .single();

    if (existingSubmission) {
      console.log(`[hmrc-ct-submit] Duplicate submission blocked: ${idempotencyKey}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Duplicate submission', 
          existingSubmissionId: existingSubmission.id,
          correlationId: existingSubmission.correlation_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // Update filing status to submitting
    await supabase.from('filings').update({ status: 'submitting' }).eq('id', filingId);

    // Build GovTalk envelope
    const company = filing.company as any;
    const govTalkXml = buildGovTalkSubmitEnvelope(
      gatewayId,
      gatewayPassword,
      company.utr || '',
      company.company_name || '',
      company.company_number || '',
      filing.period_start,
      filing.period_end,
      ct600Artefact.content,
      ixbrlAccounts.content,
      ixbrlComputation.content,
      filing.is_amendment || false,
      filing.original_filing_id || undefined
    );

    // Store request artefact
    const requestHash = await sha256Hash(govTalkXml);
    await supabase.from('filing_artefacts').insert({
      filing_id: filingId,
      organization_id: filing.organization_id,
      artefact_type: 'HMRC_CT600_SUBMIT_REQUEST_XML',
      content: govTalkXml,
      content_hash: requestHash,
      content_encoding: 'utf8',
      metadata: { environment, timestamp: new Date().toISOString() }
    });

    // Create submission record
    const { data: submissionRecord, error: submissionError } = await supabase
      .from('filing_submissions')
      .insert({
        filing_id: filingId,
        organization_id: filing.organization_id,
        status: 'pending',
        environment,
        idempotency_key: idempotencyKey,
        request_payload: govTalkXml,
        request_headers: { 'Content-Type': 'application/xml' }
      })
      .select()
      .single();

    if (submissionError) {
      console.error('[hmrc-ct-submit] Failed to create submission record:', submissionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create submission record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Submit to HMRC
    const hmrcEndpoint = HMRC_CT_ENDPOINTS[environment];
    console.log(`[hmrc-ct-submit] Submitting to ${hmrcEndpoint}`);

    const hmrcResponse = await fetch(hmrcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
      },
      body: govTalkXml,
    });

    const responseXml = await hmrcResponse.text();
    console.log(`[hmrc-ct-submit] HMRC response status: ${hmrcResponse.status}`);

    // Store acknowledgement artefact
    const responseHash = await sha256Hash(responseXml);
    await supabase.from('filing_artefacts').insert({
      filing_id: filingId,
      organization_id: filing.organization_id,
      artefact_type: 'HMRC_CT600_SUBMIT_ACK_XML',
      content: responseXml,
      content_hash: responseHash,
      content_encoding: 'utf8',
      metadata: { 
        httpStatus: hmrcResponse.status, 
        environment, 
        timestamp: new Date().toISOString() 
      }
    });

    // Parse response
    const parsed = parseGovTalkResponse(responseXml);
    console.log(`[hmrc-ct-submit] Parsed response:`, JSON.stringify(parsed));

    if (parsed.qualifier === 'error' || parsed.errors?.length) {
      // Submission failed
      console.error('[hmrc-ct-submit] Submission failed:', parsed.errors);

      await supabase.from('filing_submissions').update({
        status: 'failed',
        response_status_code: hmrcResponse.status,
        response_payload: responseXml,
        error_message: parsed.errors?.map(e => `${e.code}: ${e.message}`).join('; ')
      }).eq('id', submissionRecord.id);

      await supabase.from('filings').update({ status: 'submission_failed' }).eq('id', filingId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'HMRC rejected submission', 
          errors: parsed.errors 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (parsed.qualifier === 'acknowledgement' && parsed.correlationId) {
      // Submission acknowledged - queue polling
      console.log(`[hmrc-ct-submit] Acknowledged with correlationId: ${parsed.correlationId}`);

      // Update submission record
      await supabase.from('filing_submissions').update({
        status: 'submitted',
        correlation_id: parsed.correlationId,
        response_status_code: hmrcResponse.status,
        response_payload: responseXml
      }).eq('id', submissionRecord.id);

      // Update filing with correlation ID
      await supabase.from('filings').update({ 
        status: 'submitted',
        hmrc_correlation_id: parsed.correlationId,
        poll_count: 0,
        last_poll_at: null
      }).eq('id', filingId);

      // Queue polling job
      const pollDelay = (parsed.pollInterval || 5) * 1000;
      await supabase.from('filing_queue').insert({
        organization_id: filing.organization_id,
        filing_id: filingId,
        filing_type: 'CT600_HMRC',
        status: 'pending',
        idempotency_key: `poll:${parsed.correlationId}`,
        next_attempt_at: new Date(Date.now() + pollDelay).toISOString(),
        max_attempts: MAX_POLL_ATTEMPTS,
        metadata: { 
          correlationId: parsed.correlationId,
          pollInterval: parsed.pollInterval || 5,
          environment
        }
      });

      // Audit log
      await supabase.from('audit_log').insert({
        organization_id: filing.organization_id,
        entity_type: 'filing',
        entity_id: filingId,
        action: 'hmrc_ct_submitted',
        metadata: { 
          correlationId: parsed.correlationId, 
          environment,
          pollInterval: parsed.pollInterval
        }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'submitted',
          correlationId: parsed.correlationId,
          pollInterval: parsed.pollInterval
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unexpected response
    console.error('[hmrc-ct-submit] Unexpected response qualifier:', parsed.qualifier);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Unexpected HMRC response',
        qualifier: parsed.qualifier 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );

  } catch (error) {
    console.error('[hmrc-ct-submit] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

import { CTComputationResult } from './ct-computation-engine';

/**
 * CT600 GovTalk XML Builder for HMRC Transaction Engine submission
 * Generates full GovTalk envelope with inline base64 iXBRL attachments
 * Uses real XML parsing (no regex) and proper UTF-8 encoding
 */

// ============= INTERFACES =============

export interface CT600XMLInput {
  companyName: string;
  companyNumber: string;
  utr: string;
  periodStart: string;
  periodEnd: string;
  ctComputation: CTComputationResult;
  registeredOffice: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    country?: string;
  };
  isAmendment?: boolean;
  originalSubmissionReference?: string;
}

export interface GovTalkEnvelopeInput {
  gatewayId: string;
  gatewayPassword: string;
  utr: string;
  companyName: string;
  companyNumber: string;
  periodStart: string;
  periodEnd: string;
  ct600Xml: string;
  ixbrlAccounts: string;
  ixbrlComputation: string;
  isAmendment?: boolean;
  originalReference?: string;
}

export interface GovTalkResponse {
  qualifier: 'acknowledgement' | 'response' | 'error';
  correlationId?: string;
  pollInterval?: number;
  transactionId?: string;
  receiptReference?: string;
  errors?: Array<{ code: string; message: string; location?: string }>;
  timestamp: string;
  rawXml: string;
}

export interface CT600XMLResult {
  xml: string;
  transactionId: string;
  version: string;
}

// ============= XML UTILITIES =============

/**
 * Escape XML special characters including control characters
 * Comprehensive escaping for all XML-unsafe characters
 */
export function escapeXmlSafe(str: string): string {
  if (!str) return '';
  
  return str
    // First escape ampersand (must be first)
    .replace(/&/g, '&amp;')
    // Then other XML entities
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Remove control characters (except tab, newline, carriage return)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Encode string to UTF-8 safe base64
 * Properly handles Unicode characters
 */
export function encodeBase64Utf8(str: string): string {
  // Convert string to UTF-8 byte array
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(str);
  
  // Convert bytes to base64
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  
  return btoa(binary);
}

/**
 * Decode base64 to UTF-8 string
 */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

/**
 * Generate MD5 hash for Gateway password authentication
 * Uses Web Crypto API
 */
export async function md5Hash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  
  // Use SubtleCrypto for hashing (MD5 not directly supported, use SHA-256 for now)
  // Note: HMRC actually requires MD5, but browsers don't support it natively
  // In production edge function, we use a proper MD5 implementation
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous MD5 hash for Deno edge functions
 * This is a pure JS implementation for environments without crypto.subtle MD5
 */
export function md5HashSync(str: string): string {
  // Simple MD5 implementation for GovTalk authentication
  // Based on RFC 1321
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

function formatAmount(amount: number): string {
  return Math.round(amount).toString();
}

function getPoolAllowance(pools: any[], poolType: string): number {
  const pool = pools?.find(p => p.pool_type === poolType);
  return pool?.wda_claimed || 0;
}

function getTotalClaimsByType(claims: any[], claimType: string): number {
  return claims?.filter(c => c.claim_type === claimType)?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
}

// ============= GOVTALK ENVELOPE BUILDERS =============

/**
 * Build GovTalk submission envelope for CT600
 * Full envelope with Gateway ID + MD5 auth + inline base64 iXBRL attachments
 */
export function buildGovTalkSubmitEnvelope(input: GovTalkEnvelopeInput): string {
  const transactionId = `CT600-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const passwordHash = md5HashSync(input.gatewayPassword);
  
  // Encode iXBRL content to base64 (UTF-8 safe)
  const accountsBase64 = encodeBase64Utf8(input.ixbrlAccounts);
  const computationBase64 = encodeBase64Utf8(input.ixbrlComputation);
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
        <SenderID>${escapeXmlSafe(input.gatewayId)}</SenderID>
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
      <Key Type="UTR">${escapeXmlSafe(input.utr)}</Key>
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
          <Key Type="UTR">${escapeXmlSafe(input.utr)}</Key>
        </Keys>
        <PeriodStart>${formatDate(input.periodStart)}</PeriodStart>
        <PeriodEnd>${formatDate(input.periodEnd)}</PeriodEnd>
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
          <CompanyName>${escapeXmlSafe(input.companyName)}</CompanyName>
          <RegistrationNumber>${escapeXmlSafe(input.companyNumber)}</RegistrationNumber>
          <Reference>${escapeXmlSafe(input.utr)}</Reference>
        </CompanyInformation>
        ${input.ct600Xml}
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
        ${input.isAmendment ? `
        <Amendment>
          <OriginalSubmissionReference>${escapeXmlSafe(input.originalReference || '')}</OriginalSubmissionReference>
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

  return xml;
}

/**
 * Build GovTalk poll request envelope
 */
export function buildGovTalkPollEnvelope(correlationId: string, gatewayId: string, gatewayPassword: string): string {
  const passwordHash = md5HashSync(gatewayPassword);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>poll</Qualifier>
      <Function>submit</Function>
      <CorrelationID>${escapeXmlSafe(correlationId)}</CorrelationID>
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
    <Keys/>
  </GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

/**
 * Build GovTalk delete request envelope
 */
export function buildGovTalkDeleteEnvelope(correlationId: string, gatewayId: string, gatewayPassword: string): string {
  const passwordHash = md5HashSync(gatewayPassword);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>delete</Function>
      <CorrelationID>${escapeXmlSafe(correlationId)}</CorrelationID>
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
    <Keys/>
  </GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

// ============= XML PARSING (Real DOM Parser) =============

/**
 * Parse GovTalk response using real XML DOM parser
 * No regex - uses DOMParser for proper XML handling
 */
export function parseGovTalkResponse(responseXml: string): GovTalkResponse {
  const timestamp = new Date().toISOString();
  
  try {
    // Use DOMParser for real XML parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseXml, 'application/xml');
    
    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return {
        qualifier: 'error',
        errors: [{ code: 'XML_PARSE_ERROR', message: parseError.textContent || 'XML parsing failed' }],
        timestamp,
        rawXml: responseXml
      };
    }
    
    // Extract qualifier from MessageDetails
    const qualifierEl = doc.getElementsByTagName('Qualifier')[0];
    const qualifier = qualifierEl?.textContent?.toLowerCase() as 'acknowledgement' | 'response' | 'error' || 'error';
    
    // Extract correlation ID
    const correlationEl = doc.getElementsByTagName('CorrelationID')[0];
    const correlationId = correlationEl?.textContent || undefined;
    
    // Extract poll interval (in seconds)
    const pollIntervalEl = doc.getElementsByTagName('PollInterval')[0];
    const pollInterval = pollIntervalEl ? parseInt(pollIntervalEl.textContent || '5', 10) : undefined;
    
    // Extract transaction ID
    const transactionIdEl = doc.getElementsByTagName('TransactionID')[0];
    const transactionId = transactionIdEl?.textContent || undefined;
    
    // Extract receipt reference (in final response)
    const receiptEl = doc.getElementsByTagName('ReceiptReference')[0] || 
                      doc.getElementsByTagName('IRmarkReceipt')[0];
    const receiptReference = receiptEl?.textContent || undefined;
    
    // Extract errors
    const errors: Array<{ code: string; message: string; location?: string }> = [];
    const errorElements = doc.getElementsByTagName('Error');
    for (let i = 0; i < errorElements.length; i++) {
      const errorEl = errorElements[i];
      const codeEl = errorEl.getElementsByTagName('Number')[0] || errorEl.getElementsByTagName('Code')[0];
      const messageEl = errorEl.getElementsByTagName('Text')[0] || errorEl.getElementsByTagName('Message')[0];
      const locationEl = errorEl.getElementsByTagName('Location')[0];
      
      errors.push({
        code: codeEl?.textContent || 'UNKNOWN',
        message: messageEl?.textContent || 'Unknown error',
        location: locationEl?.textContent || undefined
      });
    }
    
    // Check for GovTalkErrors
    const govTalkErrors = doc.getElementsByTagName('GovTalkErrors')[0];
    if (govTalkErrors) {
      const gtErrorElements = govTalkErrors.getElementsByTagName('Error');
      for (let i = 0; i < gtErrorElements.length; i++) {
        const errorEl = gtErrorElements[i];
        const raisedBy = errorEl.getElementsByTagName('RaisedBy')[0];
        const number = errorEl.getElementsByTagName('Number')[0];
        const text = errorEl.getElementsByTagName('Text')[0];
        
        errors.push({
          code: number?.textContent || 'GOVTALK_ERROR',
          message: `${raisedBy?.textContent || 'System'}: ${text?.textContent || 'Unknown error'}`,
        });
      }
    }
    
    return {
      qualifier: errors.length > 0 && qualifier !== 'response' ? 'error' : qualifier,
      correlationId,
      pollInterval,
      transactionId,
      receiptReference,
      errors: errors.length > 0 ? errors : undefined,
      timestamp,
      rawXml: responseXml
    };
  } catch (error) {
    return {
      qualifier: 'error',
      errors: [{ code: 'PARSE_EXCEPTION', message: String(error) }],
      timestamp,
      rawXml: responseXml
    };
  }
}

/**
 * Generate SHA256 hash for artefact integrity
 */
export async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============= CT600 CONTENT BUILDERS =============

/**
 * Build CT600 XML payload (inner content, not full envelope)
 */
export function buildCT600XML(input: CT600XMLInput): CT600XMLResult {
  const transactionId = `CT600-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const version = '3.0.0';
  
  const ct = input.ctComputation;
  
  // Build CT600 content (used inside GovTalk Body)
  const xml = `<CT600>
    <Box1>small</Box1>
    <Box145>${formatAmount(ct.accounting_profit)}</Box145>
    <Box155>${formatAmount(ct.total_add_backs)}</Box155>
    <Box160>${formatAmount(ct.total_deductions)}</Box160>
    <Box165>${formatAmount(ct.taxable_total_profits)}</Box165>
    <Box235>${formatAmount(ct.net_capital_allowances)}</Box235>
    <Box275>${formatAmount(ct.taxable_total_profits)}</Box275>
    <Box430>${formatAmount(ct.corporation_tax_due)}</Box430>
    ${ct.marginal_relief_amount > 0 ? `<Box435>${formatAmount(ct.marginal_relief_amount)}</Box435>` : ''}
    <Box440>${formatAmount(ct.corporation_tax_due)}</Box440>
    <Box475>0</Box475>
    <Box480>${formatAmount(ct.corporation_tax_due)}</Box480>
  </CT600>
  <CapitalAllowances>
    <MainPoolWDA>${formatAmount(getPoolAllowance(ct.pools_summary, 'MAIN'))}</MainPoolWDA>
    <SpecialRatePoolWDA>${formatAmount(getPoolAllowance(ct.pools_summary, 'SPECIAL_RATE'))}</SpecialRatePoolWDA>
    <AIAClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'AIA'))}</AIAClaimed>
    <FYAClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'FYA_50') + getTotalClaimsByType(ct.claims_summary, 'FYA_100'))}</FYAClaimed>
    <FullExpensingClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'FULL_EXPENSING'))}</FullExpensingClaimed>
    <TotalAllowances>${formatAmount(ct.total_capital_allowances)}</TotalAllowances>
    ${ct.balancing_charges > 0 ? `<BalancingCharge>${formatAmount(ct.balancing_charges)}</BalancingCharge>` : ''}
  </CapitalAllowances>`;

  return {
    xml,
    transactionId,
    version
  };
}

/**
 * Validate CT600 XML input before generation
 */
export function validateCT600Input(
  input: Partial<CT600XMLInput>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.companyName) errors.push('Company name is required');
  if (!input.companyNumber) errors.push('Company number is required');
  if (!input.utr) errors.push('UTR is required');
  if (!input.periodStart) errors.push('Period start date is required');
  if (!input.periodEnd) errors.push('Period end date is required');
  if (!input.ctComputation) errors.push('CT computation is required');
  if (!input.registeredOffice?.line1) errors.push('Registered office address is required');
  if (!input.registeredOffice?.city) errors.push('Registered office city is required');
  if (!input.registeredOffice?.postcode) errors.push('Registered office postcode is required');

  if (input.periodStart && input.periodEnd) {
    const start = new Date(input.periodStart);
    const end = new Date(input.periodEnd);
    if (end <= start) {
      errors.push('Period end must be after period start');
    }
    const months = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months > 12) {
      errors.push('Accounting period cannot exceed 12 months');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============= LEGACY EXPORTS (for compatibility) =============

export interface CT600ResponseResult {
  success: boolean;
  correlationId?: string;
  receiptReference?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp?: string;
}

export function parseCT600Response(responseXml: string): CT600ResponseResult {
  const parsed = parseGovTalkResponse(responseXml);
  
  return {
    success: parsed.qualifier === 'response' && !parsed.errors?.length,
    correlationId: parsed.correlationId,
    receiptReference: parsed.receiptReference,
    errorCode: parsed.errors?.[0]?.code,
    errorMessage: parsed.errors?.[0]?.message,
    timestamp: parsed.timestamp
  };
}

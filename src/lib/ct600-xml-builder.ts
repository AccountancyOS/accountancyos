import { CTComputationResult } from './ct-computation-engine';

/**
 * CT600 GovTalk XML Builder for HMRC Transaction Engine submission
 * Generates full GovTalk envelope with inline base64 iXBRL attachments
 * Uses real XML parsing and proper UTF-8 encoding
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
 * Synchronous MD5 hash for GovTalk authentication
 * Pure JS implementation - no fallback to SHA-256
 * HMRC requires MD5 for Gateway password authentication
 */
export function md5HashSync(str: string): string {
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

// ============= SHA-256 FOR ARTEFACT HASHING =============

export async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

// ============= XML PARSING (Browser DOMParser) =============

/**
 * Parse GovTalk response using browser DOMParser
 * For client-side code only - edge functions use fast-xml-parser
 */
export function parseGovTalkResponse(responseXml: string): GovTalkResponse {
  const timestamp = new Date().toISOString();
  
  try {
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
    
    // Extract poll interval
    const pollIntervalEl = doc.getElementsByTagName('PollInterval')[0];
    const pollInterval = pollIntervalEl ? parseInt(pollIntervalEl.textContent || '5', 10) : undefined;
    
    // Extract transaction ID
    const transactionIdEl = doc.getElementsByTagName('TransactionID')[0];
    const transactionId = transactionIdEl?.textContent || undefined;
    
    // Extract receipt reference
    const receiptEl = doc.getElementsByTagName('ReceiptReference')[0] || doc.getElementsByTagName('IRmarkReceipt')[0];
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

// ============= NORMALIZED CT COMPUTATION =============

/**
 * Canonical normalized CT computation interface for CT600 builder
 * Maps from snake_case CTComputationResult to a validated model
 */
export interface NormalizedCTComputation {
  adjustedTradingProfit: number;
  taxableTotalProfits: number;
  corporationTaxDue: number;
  marginalReliefAmount: number;
  totalDeductions: number;
  netCapitalAllowances: number;
  associatedCompaniesCount: number;
  poolsSummary: any[];
  claimsSummary: any[];
}

/**
 * Normalize CTComputationResult (snake_case) to canonical model
 * Validates critical fields and provides safe defaults
 */
export function normalizeCTComputation(raw: any): NormalizedCTComputation {
  // Validate critical fields - throw if missing
  if (raw.taxable_total_profits === undefined || raw.taxable_total_profits === null) {
    throw new Error('CT computation missing taxable_total_profits - cannot generate CT600');
  }
  if (raw.corporation_tax_due === undefined || raw.corporation_tax_due === null) {
    throw new Error('CT computation missing corporation_tax_due - cannot generate CT600');
  }
  
  // Calculate adjusted trading profit from available fields
  const accountingProfit = raw.accounting_profit ?? 0;
  const totalAddBacks = raw.total_add_backs ?? 0;
  const totalDeductions = raw.total_deductions ?? 0;
  const adjustedTradingProfit = accountingProfit + totalAddBacks - totalDeductions;
  
  return {
    adjustedTradingProfit,
    taxableTotalProfits: raw.taxable_total_profits,
    corporationTaxDue: raw.corporation_tax_due,
    marginalReliefAmount: raw.marginal_relief_amount ?? 0,
    totalDeductions: totalDeductions,
    netCapitalAllowances: raw.net_capital_allowances ?? 0,
    associatedCompaniesCount: raw.associated_companies_count ?? 0,
    poolsSummary: raw.pools_summary ?? [],
    claimsSummary: raw.claims_summary ?? [],
  };
}

/**
 * Runtime assertion for normalized CT computation
 */
export function assertNormalizedCTComputation(ct: NormalizedCTComputation): void {
  const errors: string[] = [];
  
  if (typeof ct.taxableTotalProfits !== 'number' || isNaN(ct.taxableTotalProfits)) {
    errors.push('taxableTotalProfits must be a valid number');
  }
  if (typeof ct.corporationTaxDue !== 'number' || isNaN(ct.corporationTaxDue)) {
    errors.push('corporationTaxDue must be a valid number');
  }
  if (ct.corporationTaxDue < 0) {
    errors.push('corporationTaxDue cannot be negative');
  }
  
  if (errors.length > 0) {
    throw new Error(`CT computation validation failed: ${errors.join(', ')}`);
  }
}

// ============= MD5 VALIDATION =============

/**
 * Validate MD5 implementation against known test vectors
 * Must pass all tests for HMRC gateway auth to work
 */
export function validateMD5Implementation(): { valid: boolean; failures: string[] } {
  const testVectors = [
    { input: '', expected: 'd41d8cd98f00b204e9800998ecf8427e' },
    { input: 'a', expected: '0cc175b9c0f1b6a831c399e269772661' },
    { input: 'abc', expected: '900150983cd24fb0d6963f7d28e17f72' },
    { input: 'message digest', expected: 'f96b697d7cb7938d525a2f31aaf161d0' },
  ];
  
  const failures: string[] = [];
  
  for (const test of testVectors) {
    const result = md5HashSync(test.input);
    if (result !== test.expected) {
      failures.push(`MD5("${test.input}") = "${result}", expected "${test.expected}"`);
    }
  }
  
  return { valid: failures.length === 0, failures };
}

// ============= XML VALIDATION =============

/**
 * Self-check validator for generated XML
 * Catches common issues before HMRC submission
 */
export function validateGeneratedXML(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for unescaped ampersands (that aren't entities)
  const unescapedAmpersand = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/;
  if (unescapedAmpersand.test(xml)) {
    errors.push('XML contains unescaped ampersand');
  }
  
  // Check for illegal control characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(xml)) {
    errors.push('XML contains illegal control characters');
  }
  
  // Check required CT600 nodes exist
  const requiredNodes = ['TaxableProfit', 'CorporationTaxDue', 'TotalCorporationTax'];
  for (const node of requiredNodes) {
    if (!xml.includes(`<${node}>`)) {
      errors.push(`Missing required node: ${node}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// ============= CT600 CONTENT BUILDERS =============

/**
 * Build CT600 XML content (inner content, not full GovTalk envelope)
 * Uses normalized CT computation with correct field names
 */
export function buildCT600XML(input: CT600XMLInput): CT600XMLResult {
  const transactionId = `CT600-${Date.now()}`;
  
  // Normalize and validate the CT computation
  const ct = normalizeCTComputation(input.ctComputation);
  assertNormalizedCTComputation(ct);
  
  // Build capital allowances section
  const caXml = ct.netCapitalAllowances ? `
        <CapitalAllowances>
          <TotalCapitalAllowances>${formatAmount(ct.netCapitalAllowances)}</TotalCapitalAllowances>
        </CapitalAllowances>` : '';

  const xml = `
        <TradingProfits>
          <TurnoverPerAccounts>${formatAmount(ct.adjustedTradingProfit)}</TurnoverPerAccounts>
          <TotalTradingProfits>${formatAmount(Math.max(0, ct.adjustedTradingProfit))}</TotalTradingProfits>
        </TradingProfits>
        <TradingLosses>
          <LossesCurrentPeriod>${formatAmount(Math.abs(Math.min(0, ct.adjustedTradingProfit)))}</LossesCurrentPeriod>
        </TradingLosses>
        <PropertyIncome>
          <PropertyIncomeTotal>0</PropertyIncomeTotal>
        </PropertyIncome>
        ${caXml}
        <Deductions>
          <TotalDeductions>${formatAmount(ct.totalDeductions)}</TotalDeductions>
        </Deductions>
        <ProfitsBeforeCharges>
          <TotalProfits>${formatAmount(ct.taxableTotalProfits)}</TotalProfits>
        </ProfitsBeforeCharges>
        <TaxCalculation>
          <TaxableProfit>${formatAmount(ct.taxableTotalProfits)}</TaxableProfit>
          <CorporationTaxDue>${formatAmount(ct.corporationTaxDue)}</CorporationTaxDue>
          <MarginalRelief>${formatAmount(ct.marginalReliefAmount)}</MarginalRelief>
          <TotalCorporationTax>${formatAmount(ct.corporationTaxDue)}</TotalCorporationTax>
        </TaxCalculation>
        <AssociatedCompanies>
          <NumberOfAssociatedCompanies>${ct.associatedCompaniesCount}</NumberOfAssociatedCompanies>
        </AssociatedCompanies>`;

  // Validate generated XML
  const validation = validateGeneratedXML(xml);
  if (!validation.valid) {
    console.warn('CT600 XML validation warnings:', validation.errors);
  }

  return {
    xml,
    transactionId,
    version: '5.0'
  };
}

/**
 * Validate CT600 input before XML generation
 */
export function validateCT600Input(input: Partial<CT600XMLInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!input.companyName) errors.push('Company name is required');
  if (!input.companyNumber) errors.push('Company number is required');
  if (!input.utr) errors.push('UTR is required');
  if (!input.periodStart) errors.push('Period start is required');
  if (!input.periodEnd) errors.push('Period end is required');
  if (!input.ctComputation) errors.push('CT computation is required');
  
  if (input.utr && !/^\d{10}$/.test(input.utr)) {
    errors.push('UTR must be 10 digits');
  }
  
  if (input.companyNumber && !/^[A-Z0-9]{8}$/.test(input.companyNumber)) {
    errors.push('Company number must be 8 characters');
  }
  
  return { valid: errors.length === 0, errors };
}

// ============= LEGACY EXPORTS FOR COMPATIBILITY =============

export interface CT600ResponseResult {
  success: boolean;
  correlationId?: string;
  errors?: Array<{ code: string; message: string }>;
}

export function parseCT600Response(responseXml: string): CT600ResponseResult {
  const parsed = parseGovTalkResponse(responseXml);
  return {
    success: parsed.qualifier !== 'error',
    correlationId: parsed.correlationId,
    errors: parsed.errors
  };
}

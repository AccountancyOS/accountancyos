import { CTComputationResult } from './ct-computation-engine';

/**
 * CT600 XML Builder for HMRC submission
 * Generates CT600 XML strictly to HMRC CT Online specifications
 */

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

export interface CT600XMLResult {
  xml: string;
  transactionId: string;
  version: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

function getPoolAllowance(pools: any[], poolType: string): number {
  const pool = pools?.find(p => p.pool_type === poolType);
  return pool?.wda_claimed || 0;
}

function getTotalClaimsByType(claims: any[], claimType: string): number {
  return claims?.filter(c => c.claim_type === claimType)?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
}

function formatAmount(amount: number): string {
  return Math.round(amount).toString();
}

/**
 * Build CT600 XML payload for HMRC submission
 */
export function buildCT600XML(input: CT600XMLInput): CT600XMLResult {
  const transactionId = `CT600-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const version = '3.0.0';
  
  const ct = input.ctComputation;
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CompanyTaxReturn xmlns="http://www.hmrc.gov.uk/schemas/ct/comp/2023" 
                  xmlns:ct="http://www.hmrc.gov.uk/schemas/ct/comp/2023"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>${input.isAmendment ? 'amendment' : 'request'}</Qualifier>
      <TransactionID>${escapeXml(transactionId)}</TransactionID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>ACCOUNTANCYOS</SenderID>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <CompanyInformation>
    <CompanyName>${escapeXml(input.companyName)}</CompanyName>
    <CompanyRegistrationNumber>${escapeXml(input.companyNumber)}</CompanyRegistrationNumber>
    <UniqueTaxpayerReference>${escapeXml(input.utr)}</UniqueTaxpayerReference>
    <RegisteredOffice>
      <Line1>${escapeXml(input.registeredOffice.line1)}</Line1>
      ${input.registeredOffice.line2 ? `<Line2>${escapeXml(input.registeredOffice.line2)}</Line2>` : ''}
      <Town>${escapeXml(input.registeredOffice.city)}</Town>
      <Postcode>${escapeXml(input.registeredOffice.postcode)}</Postcode>
      <Country>${escapeXml(input.registeredOffice.country || 'GB')}</Country>
    </RegisteredOffice>
  </CompanyInformation>
  <AccountingPeriod>
    <StartDate>${formatDate(input.periodStart)}</StartDate>
    <EndDate>${formatDate(input.periodEnd)}</EndDate>
  </AccountingPeriod>
  <CT600>
    <!-- Box 1: Type of company -->
    <Box1>small</Box1>
    
    <!-- Box 145: Profit before tax from accounts -->
    <Box145>${formatAmount(ct.accounting_profit)}</Box145>
    
    <!-- Box 155: Additions to profit -->
    <Box155>${formatAmount(ct.total_add_backs)}</Box155>
    
    <!-- Box 160: Deductions from profit -->
    <Box160>${formatAmount(ct.total_deductions)}</Box160>
    
    <!-- Box 165: Net trading profits -->
    <Box165>${formatAmount(ct.taxable_total_profits)}</Box165>
    
    <!-- Box 235: Capital allowances -->
    <Box235>${formatAmount(ct.net_capital_allowances)}</Box235>
    
    <!-- Box 275: Taxable total profits -->
    <Box275>${formatAmount(ct.taxable_total_profits)}</Box275>
    
    <!-- Box 430: Corporation tax -->
    <Box430>${formatAmount(ct.corporation_tax_due)}</Box430>
    
    ${ct.marginal_relief_amount > 0 ? `
    <!-- Box 435: Marginal relief -->
    <Box435>${formatAmount(ct.marginal_relief_amount)}</Box435>
    ` : ''}
    
    <!-- Box 440: Net corporation tax payable -->
    <Box440>${formatAmount(ct.corporation_tax_due)}</Box440>
    
    <!-- Box 475: Tax already paid -->
    <Box475>0</Box475>
    
    <!-- Box 480: Tax payable -->
    <Box480>${formatAmount(ct.corporation_tax_due)}</Box480>
  </CT600>
  <CapitalAllowances>
    <MainPoolWDA>${formatAmount(getPoolAllowance(ct.pools_summary, 'MAIN'))}</MainPoolWDA>
    <SpecialRatePoolWDA>${formatAmount(getPoolAllowance(ct.pools_summary, 'SPECIAL_RATE'))}</SpecialRatePoolWDA>
    <AIAClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'AIA'))}</AIAClaimed>
    <FYAClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'FYA_50') + getTotalClaimsByType(ct.claims_summary, 'FYA_100'))}</FYAClaimed>
    <FullExpensingClaimed>${formatAmount(getTotalClaimsByType(ct.claims_summary, 'FULL_EXPENSING'))}</FullExpensingClaimed>
    <TotalAllowances>${formatAmount(ct.total_capital_allowances)}</TotalAllowances>
    ${ct.balancing_charges > 0 ? `
    <BalancingCharge>${formatAmount(ct.balancing_charges)}</BalancingCharge>
    ` : ''}
  </CapitalAllowances>
  <Declaration>
    <DeclarationName>Director</DeclarationName>
    <DeclarationStatus>Director</DeclarationStatus>
    <DeclarationDate>${formatDate(new Date().toISOString())}</DeclarationDate>
  </Declaration>
  ${input.isAmendment && input.originalSubmissionReference ? `
  <Amendment>
    <OriginalSubmissionReference>${escapeXml(input.originalSubmissionReference)}</OriginalSubmissionReference>
    <AmendmentReason>Correction</AmendmentReason>
  </Amendment>
  ` : ''}
</CompanyTaxReturn>`;

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

  // Validate period
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

/**
 * Parse HMRC CT response
 */
export interface CT600ResponseResult {
  success: boolean;
  correlationId?: string;
  receiptReference?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp?: string;
}

export function parseCT600Response(responseXml: string): CT600ResponseResult {
  // Parse success responses
  const correlationMatch = responseXml.match(/<CorrelationID>([^<]+)<\/CorrelationID>/);
  const receiptMatch = responseXml.match(/<ReceiptReference>([^<]+)<\/ReceiptReference>/);
  const successMatch = responseXml.match(/<SuccessResponse>/);
  
  if (successMatch || receiptMatch) {
    return {
      success: true,
      correlationId: correlationMatch?.[1],
      receiptReference: receiptMatch?.[1],
      timestamp: new Date().toISOString()
    };
  }

  // Parse error responses
  const errorCodeMatch = responseXml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
  const errorMessageMatch = responseXml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);

  return {
    success: false,
    correlationId: correlationMatch?.[1],
    errorCode: errorCodeMatch?.[1],
    errorMessage: errorMessageMatch?.[1] || 'Unknown error from HMRC',
    timestamp: new Date().toISOString()
  };
}

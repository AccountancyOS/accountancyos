/**
 * CIS Submission Engine
 * Generates CIS return XML payloads per HMRC schema
 * Pure functions - no database calls
 */

// ==================== TYPES ====================

export interface CISContractorData {
  contractorUTR: string;
  contractorName: string;
  accountsOfficeReference: string;
  payeReference?: string;
  address?: {
    line1: string;
    line2?: string;
    line3?: string;
    postcode: string;
  };
}

export interface CISSubcontractorData {
  id: string;
  verificationType: 'individual' | 'partnership' | 'company';
  firstName?: string;
  lastName?: string;
  tradingName?: string;
  businessName?: string;
  companyRegistrationNumber?: string;
  utr?: string;
  niNumber?: string;
  partnerDetails?: {
    firstName: string;
    lastName: string;
    utr?: string;
    niNumber?: string;
  }[];
  verificationNumber?: string;
  deductionRate: 'gross' | 'standard' | 'higher';
}

export interface CISPaymentData {
  subcontractorId: string;
  paymentDate: string;
  grossAmount: number;
  labourAmount: number;
  materialsAmount: number;
  deductionAmount: number;
  netAmount: number;
  deductionRate: number;
  invoiceNumber?: string;
  description?: string;
}

export interface CISReturnData {
  contractor: CISContractorData;
  taxYear: string;
  taxMonth: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  employmentStatusDeclaration: boolean;
  subcontractorVerificationDeclaration: boolean;
  nilReturn?: boolean;
  notes?: string;
}

export interface CISVerificationRequestData {
  contractor: CISContractorData;
  subcontractor: CISSubcontractorData;
  matchRef?: string;
}

export interface CISValidationResult {
  isValid: boolean;
  errors: CISValidationError[];
  warnings: CISValidationWarning[];
}

export interface CISValidationError {
  field: string;
  message: string;
  code: string;
  subcontractorId?: string;
}

export interface CISValidationWarning {
  field: string;
  message: string;
  code: string;
  subcontractorId?: string;
}

export interface CISSubmissionResult {
  success: boolean;
  correlationId?: string;
  hmrcReference?: string;
  submissionDateTime?: string;
  errors?: {
    code: string;
    message: string;
  }[];
  rawResponse?: string;
}

export interface CISVerificationResult {
  success: boolean;
  verificationNumber?: string;
  deductionRate: 'gross' | 'standard' | 'higher';
  matchedName?: string;
  matchRef?: string;
  errors?: {
    code: string;
    message: string;
  }[];
}

// ==================== XML GENERATION ====================

/**
 * Generate CIS Monthly Return XML
 */
export function generateCISReturnXml(
  returnData: CISReturnData,
  subcontractors: CISSubcontractorData[],
  payments: CISPaymentData[]
): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCISCorrelationId();
  
  // Group payments by subcontractor
  const paymentsBySubcontractor = groupPaymentsBySubcontractor(payments);
  
  // Generate subcontractor entries
  const subcontractorEntries = subcontractors
    .map(sub => generateSubcontractorEntry(sub, paymentsBySubcontractor[sub.id] || []))
    .join('\n');
  
  // Calculate totals
  const totals = calculateCISTotals(payments);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CIS/MonthlyReturn/1">
  <IRheader>
    <Keys>
      <Key Type="ContractorUTR">${returnData.contractor.contractorUTR}</Key>
    </Keys>
    <PeriodEnd>${returnData.periodEnd}</PeriodEnd>
    <Sender>${returnData.contractor.accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateCISIRMark()}</IRmark>
  </IRheader>
  <CISMonthlyReturn>
    <Contractor>
      <UTR>${returnData.contractor.contractorUTR}</UTR>
      <Name>${escapeXml(returnData.contractor.contractorName)}</Name>
${returnData.contractor.accountsOfficeReference ? `      <AORef>${returnData.contractor.accountsOfficeReference}</AORef>` : ''}
${returnData.contractor.payeReference ? `      <PAYERef>${returnData.contractor.payeReference}</PAYERef>` : ''}
    </Contractor>
    <ReturnPeriod>
      <TaxYear>${returnData.taxYear}</TaxYear>
      <TaxMonth>${String(returnData.taxMonth).padStart(2, '0')}</TaxMonth>
      <PeriodStart>${returnData.periodStart}</PeriodStart>
      <PeriodEnd>${returnData.periodEnd}</PeriodEnd>
    </ReturnPeriod>
    <Declarations>
      <EmploymentStatus>${returnData.employmentStatusDeclaration ? 'yes' : 'no'}</EmploymentStatus>
      <SubcontractorVerification>${returnData.subcontractorVerificationDeclaration ? 'yes' : 'no'}</SubcontractorVerification>
    </Declarations>
${returnData.nilReturn ? `    <NilReturn>yes</NilReturn>` : `    <Subcontractors>
${subcontractorEntries}
    </Subcontractors>
    <Totals>
      <TotalPaymentsCount>${payments.length}</TotalPaymentsCount>
      <TotalGrossAmount>${formatAmount(totals.grossAmount)}</TotalGrossAmount>
      <TotalMaterialsAmount>${formatAmount(totals.materialsAmount)}</TotalMaterialsAmount>
      <TotalDeductionsAmount>${formatAmount(totals.deductionAmount)}</TotalDeductionsAmount>
    </Totals>`}
  </CISMonthlyReturn>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

function generateSubcontractorEntry(
  subcontractor: CISSubcontractorData,
  payments: CISPaymentData[]
): string {
  const totals = calculateSubcontractorTotals(payments);
  
  const identitySection = generateSubcontractorIdentity(subcontractor);
  const paymentsSection = payments.map(generatePaymentEntry).join('\n');
  
  return `      <Subcontractor>
${identitySection}
        <VerificationNumber>${subcontractor.verificationNumber || ''}</VerificationNumber>
        <DeductionRate>${mapDeductionRate(subcontractor.deductionRate)}</DeductionRate>
        <Payments>
${paymentsSection}
        </Payments>
        <SubcontractorTotals>
          <GrossAmount>${formatAmount(totals.grossAmount)}</GrossAmount>
          <MaterialsAmount>${formatAmount(totals.materialsAmount)}</MaterialsAmount>
          <DeductionAmount>${formatAmount(totals.deductionAmount)}</DeductionAmount>
        </SubcontractorTotals>
      </Subcontractor>`;
}

function generateSubcontractorIdentity(subcontractor: CISSubcontractorData): string {
  if (subcontractor.verificationType === 'company') {
    return `        <Company>
          <CompanyName>${escapeXml(subcontractor.businessName || '')}</CompanyName>
${subcontractor.companyRegistrationNumber ? `          <CompanyRegNo>${subcontractor.companyRegistrationNumber}</CompanyRegNo>` : ''}
${subcontractor.utr ? `          <UTR>${subcontractor.utr}</UTR>` : ''}
        </Company>`;
  } else if (subcontractor.verificationType === 'partnership') {
    const partners = (subcontractor.partnerDetails || []).map(p => `            <Partner>
              <Name>
                <Fore>${escapeXml(p.firstName)}</Fore>
                <Sur>${escapeXml(p.lastName)}</Sur>
              </Name>
${p.utr ? `              <UTR>${p.utr}</UTR>` : ''}
${p.niNumber ? `              <NINO>${p.niNumber}</NINO>` : ''}
            </Partner>`).join('\n');
    
    return `        <Partnership>
          <TradingName>${escapeXml(subcontractor.tradingName || '')}</TradingName>
${subcontractor.utr ? `          <UTR>${subcontractor.utr}</UTR>` : ''}
          <Partners>
${partners}
          </Partners>
        </Partnership>`;
  } else {
    return `        <Individual>
          <Name>
            <Fore>${escapeXml(subcontractor.firstName || '')}</Fore>
            <Sur>${escapeXml(subcontractor.lastName || '')}</Sur>
          </Name>
${subcontractor.tradingName ? `          <TradingName>${escapeXml(subcontractor.tradingName)}</TradingName>` : ''}
${subcontractor.utr ? `          <UTR>${subcontractor.utr}</UTR>` : ''}
${subcontractor.niNumber ? `          <NINO>${subcontractor.niNumber}</NINO>` : ''}
        </Individual>`;
  }
}

function generatePaymentEntry(payment: CISPaymentData): string {
  return `          <Payment>
            <PaymentDate>${payment.paymentDate}</PaymentDate>
            <GrossAmount>${formatAmount(payment.grossAmount)}</GrossAmount>
            <LabourAmount>${formatAmount(payment.labourAmount)}</LabourAmount>
            <MaterialsAmount>${formatAmount(payment.materialsAmount)}</MaterialsAmount>
            <DeductionAmount>${formatAmount(payment.deductionAmount)}</DeductionAmount>
${payment.invoiceNumber ? `            <InvoiceNumber>${escapeXml(payment.invoiceNumber)}</InvoiceNumber>` : ''}
          </Payment>`;
}

/**
 * Generate CIS Verification Request XML
 */
export function generateVerificationRequestXml(request: CISVerificationRequestData): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCISCorrelationId();
  
  const subcontractorIdentity = generateVerificationSubcontractorIdentity(request.subcontractor);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CIS/VerificationRequest/1">
  <IRheader>
    <Keys>
      <Key Type="ContractorUTR">${request.contractor.contractorUTR}</Key>
    </Keys>
    <Sender>${request.contractor.accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateCISIRMark()}</IRmark>
  </IRheader>
  <CISVerificationRequest>
    <Contractor>
      <UTR>${request.contractor.contractorUTR}</UTR>
      <Name>${escapeXml(request.contractor.contractorName)}</Name>
      <AORef>${request.contractor.accountsOfficeReference}</AORef>
    </Contractor>
    <Subcontractor>
${subcontractorIdentity}
    </Subcontractor>
${request.matchRef ? `    <MatchRef>${request.matchRef}</MatchRef>` : ''}
  </CISVerificationRequest>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

function generateVerificationSubcontractorIdentity(subcontractor: CISSubcontractorData): string {
  if (subcontractor.verificationType === 'company') {
    return `      <Company>
        <CompanyName>${escapeXml(subcontractor.businessName || '')}</CompanyName>
${subcontractor.companyRegistrationNumber ? `        <CompanyRegNo>${subcontractor.companyRegistrationNumber}</CompanyRegNo>` : ''}
${subcontractor.utr ? `        <UTR>${subcontractor.utr}</UTR>` : ''}
      </Company>`;
  } else if (subcontractor.verificationType === 'partnership') {
    return `      <Partnership>
        <TradingName>${escapeXml(subcontractor.tradingName || '')}</TradingName>
${subcontractor.utr ? `        <UTR>${subcontractor.utr}</UTR>` : ''}
      </Partnership>`;
  } else {
    return `      <Individual>
        <Name>
          <Fore>${escapeXml(subcontractor.firstName || '')}</Fore>
          <Sur>${escapeXml(subcontractor.lastName || '')}</Sur>
        </Name>
${subcontractor.utr ? `        <UTR>${subcontractor.utr}</UTR>` : ''}
${subcontractor.niNumber ? `        <NINO>${subcontractor.niNumber}</NINO>` : ''}
      </Individual>`;
  }
}

// ==================== VALIDATION ====================

/**
 * Validate CIS return data before submission
 */
export function validateCISReturnData(
  returnData: CISReturnData,
  subcontractors: CISSubcontractorData[],
  payments: CISPaymentData[]
): CISValidationResult {
  const errors: CISValidationError[] = [];
  const warnings: CISValidationWarning[] = [];
  
  // Validate contractor
  if (!returnData.contractor.contractorUTR || !/^\d{10}$/.test(returnData.contractor.contractorUTR)) {
    errors.push({ field: 'contractor.contractorUTR', message: 'Valid 10-digit UTR required', code: 'INVALID_CONTRACTOR_UTR' });
  }
  
  if (!returnData.contractor.accountsOfficeReference) {
    errors.push({ field: 'contractor.accountsOfficeReference', message: 'Accounts Office Reference required', code: 'MISSING_AO_REF' });
  }
  
  // Validate tax period
  if (!returnData.taxYear || !/^\d{4}\/\d{2}$/.test(returnData.taxYear)) {
    errors.push({ field: 'taxYear', message: 'Invalid tax year format (expected YYYY/YY)', code: 'INVALID_TAX_YEAR' });
  }
  
  if (returnData.taxMonth < 1 || returnData.taxMonth > 12) {
    errors.push({ field: 'taxMonth', message: 'Tax month must be between 1 and 12', code: 'INVALID_TAX_MONTH' });
  }
  
  // Validate declarations
  if (!returnData.employmentStatusDeclaration) {
    warnings.push({ field: 'employmentStatusDeclaration', message: 'Employment status declaration not confirmed', code: 'EMPLOYMENT_DECL_NOT_CONFIRMED' });
  }
  
  if (!returnData.subcontractorVerificationDeclaration) {
    warnings.push({ field: 'subcontractorVerificationDeclaration', message: 'Subcontractor verification declaration not confirmed', code: 'VERIFICATION_DECL_NOT_CONFIRMED' });
  }
  
  // Validate nil return logic
  if (returnData.nilReturn && payments.length > 0) {
    errors.push({ field: 'nilReturn', message: 'Nil return cannot have payments', code: 'NIL_RETURN_HAS_PAYMENTS' });
  }
  
  if (!returnData.nilReturn && payments.length === 0) {
    errors.push({ field: 'payments', message: 'Non-nil return must have at least one payment', code: 'NO_PAYMENTS' });
  }
  
  // Validate subcontractors
  subcontractors.forEach((sub, index) => {
    const subPrefix = `subcontractors[${index}]`;
    
    if (!sub.verificationNumber && sub.deductionRate !== 'higher') {
      errors.push({ field: `${subPrefix}.verificationNumber`, message: 'Verification number required for non-unverified subcontractors', code: 'MISSING_VERIFICATION', subcontractorId: sub.id });
    }
    
    // Validate based on type
    if (sub.verificationType === 'individual') {
      if (!sub.firstName || !sub.lastName) {
        errors.push({ field: `${subPrefix}.name`, message: 'First name and last name required for individuals', code: 'MISSING_NAME', subcontractorId: sub.id });
      }
      if (!sub.utr && !sub.niNumber) {
        errors.push({ field: `${subPrefix}.identifier`, message: 'UTR or NI number required for individuals', code: 'MISSING_IDENTIFIER', subcontractorId: sub.id });
      }
    } else if (sub.verificationType === 'company') {
      if (!sub.businessName) {
        errors.push({ field: `${subPrefix}.businessName`, message: 'Company name required', code: 'MISSING_COMPANY_NAME', subcontractorId: sub.id });
      }
    } else if (sub.verificationType === 'partnership') {
      if (!sub.tradingName) {
        errors.push({ field: `${subPrefix}.tradingName`, message: 'Trading name required for partnerships', code: 'MISSING_TRADING_NAME', subcontractorId: sub.id });
      }
    }
  });
  
  // Validate payments
  payments.forEach((payment, index) => {
    const paymentPrefix = `payments[${index}]`;
    
    if (payment.grossAmount <= 0) {
      errors.push({ field: `${paymentPrefix}.grossAmount`, message: 'Gross amount must be positive', code: 'INVALID_GROSS_AMOUNT', subcontractorId: payment.subcontractorId });
    }
    
    if (payment.labourAmount < 0) {
      errors.push({ field: `${paymentPrefix}.labourAmount`, message: 'Labour amount cannot be negative', code: 'INVALID_LABOUR_AMOUNT', subcontractorId: payment.subcontractorId });
    }
    
    if (payment.materialsAmount < 0) {
      errors.push({ field: `${paymentPrefix}.materialsAmount`, message: 'Materials amount cannot be negative', code: 'INVALID_MATERIALS_AMOUNT', subcontractorId: payment.subcontractorId });
    }
    
    // Validate amounts add up
    const expectedGross = payment.labourAmount + payment.materialsAmount;
    if (Math.abs(payment.grossAmount - expectedGross) > 0.01) {
      warnings.push({ field: `${paymentPrefix}.grossAmount`, message: 'Gross amount does not equal labour + materials', code: 'AMOUNT_MISMATCH', subcontractorId: payment.subcontractorId });
    }
    
    // Validate deduction calculation
    const expectedDeduction = payment.labourAmount * (payment.deductionRate / 100);
    if (Math.abs(payment.deductionAmount - expectedDeduction) > 0.01) {
      warnings.push({ field: `${paymentPrefix}.deductionAmount`, message: 'Deduction amount does not match expected rate', code: 'DEDUCTION_MISMATCH', subcontractorId: payment.subcontractorId });
    }
    
    // Validate net amount
    const expectedNet = payment.grossAmount - payment.deductionAmount;
    if (Math.abs(payment.netAmount - expectedNet) > 0.01) {
      warnings.push({ field: `${paymentPrefix}.netAmount`, message: 'Net amount does not match gross minus deductions', code: 'NET_MISMATCH', subcontractorId: payment.subcontractorId });
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate verification request
 */
export function validateVerificationRequest(request: CISVerificationRequestData): CISValidationResult {
  const errors: CISValidationError[] = [];
  const warnings: CISValidationWarning[] = [];
  
  // Validate contractor
  if (!request.contractor.contractorUTR || !/^\d{10}$/.test(request.contractor.contractorUTR)) {
    errors.push({ field: 'contractor.contractorUTR', message: 'Valid 10-digit UTR required', code: 'INVALID_CONTRACTOR_UTR' });
  }
  
  // Validate subcontractor based on type
  const sub = request.subcontractor;
  if (sub.verificationType === 'individual') {
    if (!sub.firstName || !sub.lastName) {
      errors.push({ field: 'subcontractor.name', message: 'First name and last name required', code: 'MISSING_NAME' });
    }
    if (!sub.utr && !sub.niNumber) {
      errors.push({ field: 'subcontractor.identifier', message: 'UTR or NI number required', code: 'MISSING_IDENTIFIER' });
    }
  } else if (sub.verificationType === 'company') {
    if (!sub.businessName) {
      errors.push({ field: 'subcontractor.businessName', message: 'Company name required', code: 'MISSING_COMPANY_NAME' });
    }
    if (!sub.utr && !sub.companyRegistrationNumber) {
      errors.push({ field: 'subcontractor.identifier', message: 'UTR or company registration number required', code: 'MISSING_IDENTIFIER' });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== RESPONSE PARSING ====================

/**
 * Parse HMRC CIS response XML
 */
export function parseCISResponse(xmlResponse: string): CISSubmissionResult {
  try {
    const correlationIdMatch = xmlResponse.match(/<CorrelationID>([^<]+)<\/CorrelationID>/);
    const hmrcRefMatch = xmlResponse.match(/<Reference>([^<]+)<\/Reference>/);
    const timestampMatch = xmlResponse.match(/<Timestamp>([^<]+)<\/Timestamp>/);
    
    const errorMatches = xmlResponse.matchAll(/<Error[^>]*>.*?<Code>([^<]+)<\/Code>.*?<Message>([^<]+)<\/Message>.*?<\/Error>/gs);
    const errors: { code: string; message: string }[] = [];
    for (const match of errorMatches) {
      errors.push({ code: match[1], message: match[2] });
    }
    
    const isSuccess = xmlResponse.includes('<SuccessResponse>') || 
                      xmlResponse.includes('<Acknowledgement>') ||
                      !xmlResponse.includes('<Error');
    
    return {
      success: isSuccess && errors.length === 0,
      correlationId: correlationIdMatch?.[1],
      hmrcReference: hmrcRefMatch?.[1],
      submissionDateTime: timestampMatch?.[1],
      errors: errors.length > 0 ? errors : undefined,
      rawResponse: xmlResponse,
    };
  } catch (err) {
    return {
      success: false,
      errors: [{ code: 'PARSE_ERROR', message: 'Failed to parse HMRC response' }],
      rawResponse: xmlResponse,
    };
  }
}

/**
 * Parse verification response
 */
export function parseVerificationResponse(xmlResponse: string): CISVerificationResult {
  try {
    const verificationNumberMatch = xmlResponse.match(/<VerificationNumber>([^<]+)<\/VerificationNumber>/);
    const deductionRateMatch = xmlResponse.match(/<DeductionRate>([^<]+)<\/DeductionRate>/);
    const matchedNameMatch = xmlResponse.match(/<MatchedName>([^<]+)<\/MatchedName>/);
    const matchRefMatch = xmlResponse.match(/<MatchRef>([^<]+)<\/MatchRef>/);
    
    const errorMatches = xmlResponse.matchAll(/<Error[^>]*>.*?<Code>([^<]+)<\/Code>.*?<Message>([^<]+)<\/Message>.*?<\/Error>/gs);
    const errors: { code: string; message: string }[] = [];
    for (const match of errorMatches) {
      errors.push({ code: match[1], message: match[2] });
    }
    
    const rateCode = deductionRateMatch?.[1] || 'H';
    const deductionRate = rateCode === 'G' ? 'gross' : rateCode === 'S' ? 'standard' : 'higher';
    
    return {
      success: errors.length === 0 && !!verificationNumberMatch,
      verificationNumber: verificationNumberMatch?.[1],
      deductionRate,
      matchedName: matchedNameMatch?.[1],
      matchRef: matchRefMatch?.[1],
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    return {
      success: false,
      deductionRate: 'higher',
      errors: [{ code: 'PARSE_ERROR', message: 'Failed to parse verification response' }],
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

function generateCISCorrelationId(): string {
  return `CIS-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

function generateCISIRMark(): string {
  return `CISMARK-${Date.now().toString(36).toUpperCase()}`;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mapDeductionRate(rate: 'gross' | 'standard' | 'higher'): string {
  switch (rate) {
    case 'gross': return 'G';
    case 'standard': return 'S';
    case 'higher': return 'H';
    default: return 'H';
  }
}

function groupPaymentsBySubcontractor(payments: CISPaymentData[]): Record<string, CISPaymentData[]> {
  return payments.reduce((acc, payment) => {
    if (!acc[payment.subcontractorId]) {
      acc[payment.subcontractorId] = [];
    }
    acc[payment.subcontractorId].push(payment);
    return acc;
  }, {} as Record<string, CISPaymentData[]>);
}

function calculateSubcontractorTotals(payments: CISPaymentData[]): {
  grossAmount: number;
  labourAmount: number;
  materialsAmount: number;
  deductionAmount: number;
} {
  return payments.reduce((acc, payment) => ({
    grossAmount: acc.grossAmount + payment.grossAmount,
    labourAmount: acc.labourAmount + payment.labourAmount,
    materialsAmount: acc.materialsAmount + payment.materialsAmount,
    deductionAmount: acc.deductionAmount + payment.deductionAmount,
  }), { grossAmount: 0, labourAmount: 0, materialsAmount: 0, deductionAmount: 0 });
}

function calculateCISTotals(payments: CISPaymentData[]): {
  grossAmount: number;
  materialsAmount: number;
  deductionAmount: number;
} {
  return payments.reduce((acc, payment) => ({
    grossAmount: acc.grossAmount + payment.grossAmount,
    materialsAmount: acc.materialsAmount + payment.materialsAmount,
    deductionAmount: acc.deductionAmount + payment.deductionAmount,
  }), { grossAmount: 0, materialsAmount: 0, deductionAmount: 0 });
}

// ==================== FILING TYPE CONSTANTS ====================

export const CIS_FILING_TYPES = {
  MONTHLY_RETURN: 'CIS_RETURN',
  VERIFICATION: 'CIS_VERIFICATION',
} as const;

export type CISFilingType = typeof CIS_FILING_TYPES[keyof typeof CIS_FILING_TYPES];

// ==================== DEDUCTION RATES ====================

export const CIS_DEDUCTION_RATES = {
  GROSS: 0,        // Registered for gross payment
  STANDARD: 20,    // Standard rate
  HIGHER: 30,      // Unverified rate
} as const;

export function getDeductionRatePercentage(rate: 'gross' | 'standard' | 'higher'): number {
  switch (rate) {
    case 'gross': return CIS_DEDUCTION_RATES.GROSS;
    case 'standard': return CIS_DEDUCTION_RATES.STANDARD;
    case 'higher': return CIS_DEDUCTION_RATES.HIGHER;
    default: return CIS_DEDUCTION_RATES.HIGHER;
  }
}

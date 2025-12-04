/**
 * RTI Submission Engine
 * Generates RTI XML payloads for FPS, EPS, P45, P46 per HMRC schema
 * Pure functions - no database calls
 */

// ==================== TYPES ====================

export interface FPSEmployeeData {
  employeeId: string;
  niNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F';
  address: {
    line1: string;
    line2?: string;
    line3?: string;
    postcode: string;
  };
  taxCode: string;
  nicCategory: string;
  isDirector: boolean;
  directorNICMethod?: 'cumulative' | 'annual';
  studentLoanPlan?: 'plan_1' | 'plan_2' | 'plan_4' | null;
  hasPostgraduateLoan: boolean;
  starterDeclaration?: 'A' | 'B' | 'C';
  
  // Pay period data
  taxablePay: number;
  taxDeducted: number;
  employeeNIC: number;
  employerNIC: number;
  studentLoanDeduction: number;
  postgraduateLoanDeduction: number;
  pensionContributions: number;
  pensionNotUnderNetPayArrangement?: number;
  statutoryPay?: {
    ssp?: number;
    smp?: number;
    spp?: number;
    sap?: number;
    shpp?: number;
    spbp?: number;
  };
  
  // YTD figures
  ytdTaxablePay: number;
  ytdTaxDeducted: number;
  ytdEmployeeNIC: number;
  ytdEmployerNIC: number;
  ytdStudentLoan: number;
  
  // Flags
  isLeaver?: boolean;
  leavingDate?: string;
  isIrregularPayment?: boolean;
  isSecondedEmployee?: boolean;
  paymentAfterLeaving?: boolean;
}

export interface FPSPayRunData {
  payeReference: string;
  accountsOfficeReference: string;
  taxYear: string;
  taxMonth: number;
  paymentDate: string;
  periodStart: string;
  periodEnd: string;
  payFrequency: 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';
  isLateFiling?: boolean;
  lateFilingReason?: string;
  noPaymentDates?: string[];
  isFirstSubmission?: boolean;
  isFinalSubmission?: boolean;
  relatedTaxYear?: string;
}

export interface EPSData {
  payeReference: string;
  accountsOfficeReference: string;
  taxYear: string;
  taxMonth: number;
  
  // Recovery amounts
  statutoryMaternityPay?: number;
  statutoryPaternityPay?: number;
  statutoryAdoptionPay?: number;
  sharedParentalPay?: number;
  statutoryParentalBereavementPay?: number;
  nicCompensation?: number;
  
  // CIS deductions suffered
  cisDeductionsSuffered?: number;
  
  // Apprenticeship Levy
  apprenticeshipLevyDue?: number;
  
  // Employment Allowance
  employmentAllowanceIndicator?: boolean;
  
  // Final submission flags
  schemeCeased?: boolean;
  schemeCeasedDate?: string;
  noEmployeesInPeriod?: boolean;
  periodsCovered?: string[];
}

export interface P45Data {
  employeeId: string;
  niNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  leavingDate: string;
  taxCode: string;
  isWeek1Month1?: boolean;
  ytdTaxablePay: number;
  ytdTaxDeducted: number;
  studentLoanPlan?: 'plan_1' | 'plan_2' | 'plan_4' | null;
  hasPostgraduateLoan?: boolean;
}

export interface P46Data {
  employeeId: string;
  niNumber?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F';
  address: {
    line1: string;
    line2?: string;
    line3?: string;
    postcode: string;
  };
  startDate: string;
  starterDeclaration: 'A' | 'B' | 'C';
  studentLoanPlan?: 'plan_1' | 'plan_2' | 'plan_4' | null;
  hasPostgraduateLoan?: boolean;
}

export interface RTIValidationResult {
  isValid: boolean;
  errors: RTIValidationError[];
  warnings: RTIValidationWarning[];
}

export interface RTIValidationError {
  field: string;
  message: string;
  code: string;
  employeeId?: string;
}

export interface RTIValidationWarning {
  field: string;
  message: string;
  code: string;
  employeeId?: string;
}

export interface RTISubmissionResult {
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

// ==================== XML GENERATION ====================

/**
 * Generate FPS (Full Payment Submission) XML
 */
export function generateFPSXml(payRun: FPSPayRunData, employees: FPSEmployeeData[]): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCorrelationId();
  
  const employeeEntries = employees.map(emp => generateFPSEmployeeEntry(emp)).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/17-18/1">
  <IRheader>
    <Keys>
      <Key Type="TaxOfficeNumber">${extractTaxOfficeNumber(payRun.payeReference)}</Key>
      <Key Type="TaxOfficeReference">${extractTaxOfficeReference(payRun.payeReference)}</Key>
    </Keys>
    <PeriodEnd>${payRun.periodEnd}</PeriodEnd>
    <Sender>${payRun.accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateIRMark()}</IRmark>
  </IRheader>
  <FullPaymentSubmission>
    <EmpRefs>
      <OfficeNo>${extractTaxOfficeNumber(payRun.payeReference)}</OfficeNo>
      <PayeRef>${extractTaxOfficeReference(payRun.payeReference)}</PayeRef>
      <AORef>${payRun.accountsOfficeReference}</AORef>
    </EmpRefs>
    <RelatedTaxYear>${payRun.taxYear}</RelatedTaxYear>
${payRun.isLateFiling ? `    <LateReason>${payRun.lateFilingReason || 'H'}</LateReason>` : ''}
${payRun.isFinalSubmission ? '    <FinalSubmission><ForYear>yes</ForYear></FinalSubmission>' : ''}
    <Employee>
${employeeEntries}
    </Employee>
  </FullPaymentSubmission>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

function generateFPSEmployeeEntry(emp: FPSEmployeeData): string {
  const statutoryPaySection = emp.statutoryPay ? generateStatutoryPayXml(emp.statutoryPay) : '';
  
  return `      <EmployeeDetails>
        <NINO>${emp.niNumber}</NINO>
        <Name>
          <Fore>${escapeXml(emp.firstName)}</Fore>
          <Sur>${escapeXml(emp.lastName)}</Sur>
        </Name>
        <BirthDate>${emp.dateOfBirth}</BirthDate>
        <Gender>${emp.gender}</Gender>
        <Address>
          <Line1>${escapeXml(emp.address.line1)}</Line1>
${emp.address.line2 ? `          <Line2>${escapeXml(emp.address.line2)}</Line2>` : ''}
          <Postcode>${emp.address.postcode}</Postcode>
        </Address>
      </EmployeeDetails>
      <Employment>
        <PayId>${emp.employeeId}</PayId>
        <PayFreq>${mapPayFrequency(emp)}</PayFreq>
        <TaxCode>${emp.taxCode}</TaxCode>
        <NICategory>${emp.nicCategory}</NICategory>
${emp.isDirector ? `        <DirectorshipAppt>yes</DirectorshipAppt>
        <AnnualCalcBasis>${emp.directorNICMethod === 'annual' ? 'yes' : 'no'}</AnnualCalcBasis>` : ''}
${emp.starterDeclaration ? `        <StarterDecln>${emp.starterDeclaration}</StarterDecln>` : ''}
        <Payment>
          <TaxablePay>${formatAmount(emp.taxablePay)}</TaxablePay>
          <TaxDeducted>${formatAmount(emp.taxDeducted)}</TaxDeducted>
          <NIContribs>
            <EECon>${formatAmount(emp.employeeNIC)}</EECon>
            <ERCon>${formatAmount(emp.employerNIC)}</ERCon>
          </NIContribs>
${emp.studentLoanDeduction > 0 ? `          <StudentLoanDeduction>${formatAmount(emp.studentLoanDeduction)}</StudentLoanDeduction>` : ''}
${emp.postgraduateLoanDeduction > 0 ? `          <PostGradLoanDeduction>${formatAmount(emp.postgraduateLoanDeduction)}</PostGradLoanDeduction>` : ''}
${emp.pensionContributions > 0 ? `          <PensionContribs>${formatAmount(emp.pensionContributions)}</PensionContribs>` : ''}
${statutoryPaySection}
        </Payment>
        <YTD>
          <TaxablePay>${formatAmount(emp.ytdTaxablePay)}</TaxablePay>
          <TaxDeducted>${formatAmount(emp.ytdTaxDeducted)}</TaxDeducted>
          <NIContribs>
            <EECon>${formatAmount(emp.ytdEmployeeNIC)}</EECon>
          </NIContribs>
${emp.ytdStudentLoan > 0 ? `          <StudentLoanDeduction>${formatAmount(emp.ytdStudentLoan)}</StudentLoanDeduction>` : ''}
        </YTD>
${emp.isLeaver ? `        <LeavingDate>${emp.leavingDate}</LeavingDate>` : ''}
${emp.isIrregularPayment ? '        <IrregularPayment>yes</IrregularPayment>' : ''}
${emp.paymentAfterLeaving ? '        <PaymentAfterLeaving>yes</PaymentAfterLeaving>' : ''}
      </Employment>`;
}

function generateStatutoryPayXml(statutoryPay: FPSEmployeeData['statutoryPay']): string {
  if (!statutoryPay) return '';
  
  const parts: string[] = [];
  if (statutoryPay.ssp && statutoryPay.ssp > 0) {
    parts.push(`          <SSP>${formatAmount(statutoryPay.ssp)}</SSP>`);
  }
  if (statutoryPay.smp && statutoryPay.smp > 0) {
    parts.push(`          <SMP>${formatAmount(statutoryPay.smp)}</SMP>`);
  }
  if (statutoryPay.spp && statutoryPay.spp > 0) {
    parts.push(`          <SPP>${formatAmount(statutoryPay.spp)}</SPP>`);
  }
  if (statutoryPay.sap && statutoryPay.sap > 0) {
    parts.push(`          <SAP>${formatAmount(statutoryPay.sap)}</SAP>`);
  }
  if (statutoryPay.shpp && statutoryPay.shpp > 0) {
    parts.push(`          <ShPP>${formatAmount(statutoryPay.shpp)}</ShPP>`);
  }
  if (statutoryPay.spbp && statutoryPay.spbp > 0) {
    parts.push(`          <SPBP>${formatAmount(statutoryPay.spbp)}</SPBP>`);
  }
  
  return parts.join('\n');
}

/**
 * Generate EPS (Employer Payment Summary) XML
 */
export function generateEPSXml(payRun: FPSPayRunData, epsData: EPSData): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCorrelationId();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/17-18/1">
  <IRheader>
    <Keys>
      <Key Type="TaxOfficeNumber">${extractTaxOfficeNumber(epsData.payeReference)}</Key>
      <Key Type="TaxOfficeReference">${extractTaxOfficeReference(epsData.payeReference)}</Key>
    </Keys>
    <PeriodEnd>${payRun.periodEnd}</PeriodEnd>
    <Sender>${epsData.accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateIRMark()}</IRmark>
  </IRheader>
  <EmployerPaymentSummary>
    <EmpRefs>
      <OfficeNo>${extractTaxOfficeNumber(epsData.payeReference)}</OfficeNo>
      <PayeRef>${extractTaxOfficeReference(epsData.payeReference)}</PayeRef>
      <AORef>${epsData.accountsOfficeReference}</AORef>
    </EmpRefs>
    <RelatedTaxYear>${epsData.taxYear}</RelatedTaxYear>
${epsData.noEmployeesInPeriod ? `    <NoPaymentDates>
${epsData.periodsCovered?.map(p => `      <PeriodCovered>${p}</PeriodCovered>`).join('\n') || ''}
    </NoPaymentDates>` : ''}
${generateRecoverySection(epsData)}
${epsData.cisDeductionsSuffered ? `    <CISDeductionsSuffered>${formatAmount(epsData.cisDeductionsSuffered)}</CISDeductionsSuffered>` : ''}
${epsData.apprenticeshipLevyDue ? `    <ApprenticeshipLevy>
      <LevyDueYTD>${formatAmount(epsData.apprenticeshipLevyDue)}</LevyDueYTD>
    </ApprenticeshipLevy>` : ''}
${epsData.employmentAllowanceIndicator !== undefined ? `    <EmploymentAllowance>${epsData.employmentAllowanceIndicator ? 'yes' : 'no'}</EmploymentAllowance>` : ''}
${epsData.schemeCeased ? `    <FinalSubmission>
      <SchemeCeased>${epsData.schemeCeasedDate}</SchemeCeased>
    </FinalSubmission>` : ''}
  </EmployerPaymentSummary>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

function generateRecoverySection(epsData: EPSData): string {
  const hasRecovery = epsData.statutoryMaternityPay || 
                      epsData.statutoryPaternityPay || 
                      epsData.statutoryAdoptionPay ||
                      epsData.sharedParentalPay ||
                      epsData.statutoryParentalBereavementPay ||
                      epsData.nicCompensation;
  
  if (!hasRecovery) return '';
  
  return `    <RecoverableAmountsYTD>
${epsData.statutoryMaternityPay ? `      <SMPRecovered>${formatAmount(epsData.statutoryMaternityPay)}</SMPRecovered>` : ''}
${epsData.statutoryPaternityPay ? `      <SPPRecovered>${formatAmount(epsData.statutoryPaternityPay)}</SPPRecovered>` : ''}
${epsData.statutoryAdoptionPay ? `      <SAPRecovered>${formatAmount(epsData.statutoryAdoptionPay)}</SAPRecovered>` : ''}
${epsData.sharedParentalPay ? `      <ShPPRecovered>${formatAmount(epsData.sharedParentalPay)}</ShPPRecovered>` : ''}
${epsData.statutoryParentalBereavementPay ? `      <SPBPRecovered>${formatAmount(epsData.statutoryParentalBereavementPay)}</SPBPRecovered>` : ''}
${epsData.nicCompensation ? `      <NICCompensation>${formatAmount(epsData.nicCompensation)}</NICCompensation>` : ''}
    </RecoverableAmountsYTD>`;
}

/**
 * Generate P45 (Leaver) XML
 */
export function generateP45Xml(
  payeReference: string,
  accountsOfficeReference: string,
  employee: P45Data
): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCorrelationId();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/17-18/1">
  <IRheader>
    <Keys>
      <Key Type="TaxOfficeNumber">${extractTaxOfficeNumber(payeReference)}</Key>
      <Key Type="TaxOfficeReference">${extractTaxOfficeReference(payeReference)}</Key>
    </Keys>
    <Sender>${accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateIRMark()}</IRmark>
  </IRheader>
  <P45>
    <EmpRefs>
      <OfficeNo>${extractTaxOfficeNumber(payeReference)}</OfficeNo>
      <PayeRef>${extractTaxOfficeReference(payeReference)}</PayeRef>
    </EmpRefs>
    <EmployeeDetails>
      <NINO>${employee.niNumber}</NINO>
      <Name>
        <Fore>${escapeXml(employee.firstName)}</Fore>
        <Sur>${escapeXml(employee.lastName)}</Sur>
      </Name>
      <BirthDate>${employee.dateOfBirth}</BirthDate>
    </EmployeeDetails>
    <Leaving>
      <LeavingDate>${employee.leavingDate}</LeavingDate>
      <TaxCode>${employee.taxCode}</TaxCode>
${employee.isWeek1Month1 ? '      <Week1Month1>yes</Week1Month1>' : ''}
      <YTDTaxablePay>${formatAmount(employee.ytdTaxablePay)}</YTDTaxablePay>
      <YTDTaxDeducted>${formatAmount(employee.ytdTaxDeducted)}</YTDTaxDeducted>
${employee.studentLoanPlan ? `      <StudentLoanPlan>${employee.studentLoanPlan.replace('plan_', '')}</StudentLoanPlan>` : ''}
${employee.hasPostgraduateLoan ? '      <PostgraduateLoan>yes</PostgraduateLoan>' : ''}
    </Leaving>
  </P45>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

/**
 * Generate P46 (Starter) XML - now integrated into FPS starter declaration
 */
export function generateP46Xml(
  payeReference: string,
  accountsOfficeReference: string,
  employee: P46Data
): string {
  const timestamp = new Date().toISOString();
  const correlationId = generateCorrelationId();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/17-18/1">
  <IRheader>
    <Keys>
      <Key Type="TaxOfficeNumber">${extractTaxOfficeNumber(payeReference)}</Key>
      <Key Type="TaxOfficeReference">${extractTaxOfficeReference(payeReference)}</Key>
    </Keys>
    <Sender>${accountsOfficeReference}</Sender>
    <IRmark Type="generic">${generateIRMark()}</IRmark>
  </IRheader>
  <StarterDeclaration>
    <EmpRefs>
      <OfficeNo>${extractTaxOfficeNumber(payeReference)}</OfficeNo>
      <PayeRef>${extractTaxOfficeReference(payeReference)}</PayeRef>
    </EmpRefs>
    <EmployeeDetails>
${employee.niNumber ? `      <NINO>${employee.niNumber}</NINO>` : ''}
      <Name>
        <Fore>${escapeXml(employee.firstName)}</Fore>
        <Sur>${escapeXml(employee.lastName)}</Sur>
      </Name>
      <BirthDate>${employee.dateOfBirth}</BirthDate>
      <Gender>${employee.gender}</Gender>
      <Address>
        <Line1>${escapeXml(employee.address.line1)}</Line1>
${employee.address.line2 ? `        <Line2>${escapeXml(employee.address.line2)}</Line2>` : ''}
        <Postcode>${employee.address.postcode}</Postcode>
      </Address>
    </EmployeeDetails>
    <Starter>
      <StartDate>${employee.startDate}</StartDate>
      <StarterDeclaration>${employee.starterDeclaration}</StarterDeclaration>
${employee.studentLoanPlan ? `      <StudentLoanPlan>${employee.studentLoanPlan.replace('plan_', '')}</StudentLoanPlan>` : ''}
${employee.hasPostgraduateLoan ? '      <PostgraduateLoan>yes</PostgraduateLoan>' : ''}
    </Starter>
  </StarterDeclaration>
  <SubmissionHeader>
    <CorrelationID>${correlationId}</CorrelationID>
    <Timestamp>${timestamp}</Timestamp>
  </SubmissionHeader>
</IRenvelope>`;
}

// ==================== VALIDATION ====================

/**
 * Validate FPS data before submission
 */
export function validateFPSData(payRun: FPSPayRunData, employees: FPSEmployeeData[]): RTIValidationResult {
  const errors: RTIValidationError[] = [];
  const warnings: RTIValidationWarning[] = [];
  
  // Validate pay run data
  if (!payRun.payeReference || !/^\d{3}\/[A-Z0-9]+$/.test(payRun.payeReference)) {
    errors.push({ field: 'payeReference', message: 'Invalid PAYE reference format (expected XXX/XXXXX)', code: 'INVALID_PAYE_REF' });
  }
  
  if (!payRun.accountsOfficeReference || !/^\d{13}[A-Z]?$/.test(payRun.accountsOfficeReference)) {
    errors.push({ field: 'accountsOfficeReference', message: 'Invalid Accounts Office Reference', code: 'INVALID_AO_REF' });
  }
  
  if (!payRun.taxYear || !/^\d{4}\/\d{2}$/.test(payRun.taxYear)) {
    errors.push({ field: 'taxYear', message: 'Invalid tax year format (expected YYYY/YY)', code: 'INVALID_TAX_YEAR' });
  }
  
  if (payRun.taxMonth < 1 || payRun.taxMonth > 12) {
    errors.push({ field: 'taxMonth', message: 'Tax month must be between 1 and 12', code: 'INVALID_TAX_MONTH' });
  }
  
  if (employees.length === 0) {
    errors.push({ field: 'employees', message: 'FPS must include at least one employee', code: 'NO_EMPLOYEES' });
  }
  
  // Validate each employee
  employees.forEach((emp, index) => {
    const empPrefix = `employees[${index}]`;
    
    // NI Number validation (allowing for temp NI numbers)
    if (!emp.niNumber) {
      warnings.push({ field: `${empPrefix}.niNumber`, message: 'NI number missing', code: 'MISSING_NINO', employeeId: emp.employeeId });
    } else if (!/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?$/.test(emp.niNumber.replace(/\s/g, ''))) {
      errors.push({ field: `${empPrefix}.niNumber`, message: 'Invalid NI number format', code: 'INVALID_NINO', employeeId: emp.employeeId });
    }
    
    // Tax code validation
    if (!emp.taxCode) {
      errors.push({ field: `${empPrefix}.taxCode`, message: 'Tax code required', code: 'MISSING_TAX_CODE', employeeId: emp.employeeId });
    }
    
    // NIC category validation
    if (!emp.nicCategory || !/^[A-Z]$/.test(emp.nicCategory)) {
      errors.push({ field: `${empPrefix}.nicCategory`, message: 'Invalid NIC category', code: 'INVALID_NIC_CAT', employeeId: emp.employeeId });
    }
    
    // YTD validation
    if (emp.ytdTaxablePay < emp.taxablePay) {
      warnings.push({ field: `${empPrefix}.ytdTaxablePay`, message: 'YTD taxable pay less than period pay', code: 'YTD_LESS_THAN_PERIOD', employeeId: emp.employeeId });
    }
    
    // Leaver validation
    if (emp.isLeaver && !emp.leavingDate) {
      errors.push({ field: `${empPrefix}.leavingDate`, message: 'Leaving date required for leavers', code: 'MISSING_LEAVING_DATE', employeeId: emp.employeeId });
    }
  });
  
  // Late filing validation
  const paymentDate = new Date(payRun.paymentDate);
  const now = new Date();
  if (paymentDate < now && !payRun.isLateFiling) {
    warnings.push({ field: 'paymentDate', message: 'Payment date is in the past - consider marking as late filing', code: 'LATE_FILING_WARNING' });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate EPS data before submission
 */
export function validateEPSData(payRun: FPSPayRunData, epsData: EPSData): RTIValidationResult {
  const errors: RTIValidationError[] = [];
  const warnings: RTIValidationWarning[] = [];
  
  // Validate PAYE reference
  if (!epsData.payeReference || !/^\d{3}\/[A-Z0-9]+$/.test(epsData.payeReference)) {
    errors.push({ field: 'payeReference', message: 'Invalid PAYE reference format', code: 'INVALID_PAYE_REF' });
  }
  
  // Validate Accounts Office Reference
  if (!epsData.accountsOfficeReference || !/^\d{13}[A-Z]?$/.test(epsData.accountsOfficeReference)) {
    errors.push({ field: 'accountsOfficeReference', message: 'Invalid Accounts Office Reference', code: 'INVALID_AO_REF' });
  }
  
  // Validate tax year
  if (!epsData.taxYear || !/^\d{4}\/\d{2}$/.test(epsData.taxYear)) {
    errors.push({ field: 'taxYear', message: 'Invalid tax year format', code: 'INVALID_TAX_YEAR' });
  }
  
  // Validate that either recovery amounts OR no payment declaration is present
  const hasRecoveryAmounts = epsData.statutoryMaternityPay || 
                             epsData.statutoryPaternityPay ||
                             epsData.statutoryAdoptionPay ||
                             epsData.cisDeductionsSuffered ||
                             epsData.apprenticeshipLevyDue;
  
  if (!hasRecoveryAmounts && !epsData.noEmployeesInPeriod && !epsData.schemeCeased) {
    warnings.push({ field: 'epsData', message: 'EPS has no recovery amounts or special declarations', code: 'EMPTY_EPS' });
  }
  
  // Validate scheme ceased has date
  if (epsData.schemeCeased && !epsData.schemeCeasedDate) {
    errors.push({ field: 'schemeCeasedDate', message: 'Scheme ceased date required when scheme ceased', code: 'MISSING_CEASED_DATE' });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== RESPONSE PARSING ====================

/**
 * Parse HMRC RTI response XML
 */
export function parseRTIResponse(xmlResponse: string): RTISubmissionResult {
  try {
    // Simple XML parsing for key fields
    const correlationIdMatch = xmlResponse.match(/<CorrelationID>([^<]+)<\/CorrelationID>/);
    const hmrcRefMatch = xmlResponse.match(/<Reference>([^<]+)<\/Reference>/);
    const timestampMatch = xmlResponse.match(/<Timestamp>([^<]+)<\/Timestamp>/);
    
    // Check for errors
    const errorMatches = xmlResponse.matchAll(/<Error[^>]*>.*?<Code>([^<]+)<\/Code>.*?<Message>([^<]+)<\/Message>.*?<\/Error>/gs);
    const errors: { code: string; message: string }[] = [];
    for (const match of errorMatches) {
      errors.push({ code: match[1], message: match[2] });
    }
    
    // Check for success indicators
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

// ==================== HELPER FUNCTIONS ====================

function extractTaxOfficeNumber(payeReference: string): string {
  const parts = payeReference.split('/');
  return parts[0] || '';
}

function extractTaxOfficeReference(payeReference: string): string {
  const parts = payeReference.split('/');
  return parts[1] || '';
}

function generateCorrelationId(): string {
  return `RTI-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

function generateIRMark(): string {
  // In production, this would be a proper hash of the document
  return `IRMARK-${Date.now().toString(36).toUpperCase()}`;
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

function mapPayFrequency(emp: FPSEmployeeData): string {
  // Map to HMRC codes
  return 'M1'; // Monthly - would be determined from actual pay frequency
}

// ==================== FILING TYPE CONSTANTS ====================

export const RTI_FILING_TYPES = {
  FPS: 'RTI_FPS',
  EPS: 'RTI_EPS',
  P45: 'RTI_P45',
  P46: 'RTI_P46',
  EYU: 'RTI_EYU', // Earlier Year Update
  NVR: 'RTI_NVR', // NINO Verification Request
} as const;

export type RTIFilingType = typeof RTI_FILING_TYPES[keyof typeof RTI_FILING_TYPES];

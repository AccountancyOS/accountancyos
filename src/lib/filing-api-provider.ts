/**
 * Filing API Abstraction Layer
 * Provides a clean interface for filing submissions to HMRC/Companies House
 * Currently implements sandbox providers - production providers can be dropped in
 */

import { supabase } from "@/integrations/supabase/client";
import { 
  generateFPSXml, 
  generateEPSXml, 
  type FPSPayRunData, 
  type FPSEmployeeData, 
  type EPSData 
} from "@/lib/rti-submission-engine";
import { 
  generateCISReturnXml, 
  type CISReturnData, 
  type CISSubcontractorData, 
  type CISPaymentData 
} from "@/lib/cis-submission-engine";

// ==================== STRONGLY TYPED FILING TYPES ====================

export const RTI_FILING_TYPES = {
  FPS: 'RTI_FPS',
  EPS: 'RTI_EPS',
  P45: 'RTI_P45',
  P46: 'RTI_P46',
  EYU: 'RTI_EYU',
  NVR: 'RTI_NVR',
} as const;

export const CIS_FILING_TYPES = {
  RETURN: 'CIS_RETURN',
  VERIFICATION: 'CIS_VERIFICATION',
} as const;

export type RTIFilingType = typeof RTI_FILING_TYPES[keyof typeof RTI_FILING_TYPES];
export type CISFilingType = typeof CIS_FILING_TYPES[keyof typeof CIS_FILING_TYPES];
export type PayrollFilingType = RTIFilingType | CISFilingType;

// Helper to check if filing type is RTI/CIS (no client approval needed)
export function isPayrollFilingType(filingType: string): boolean {
  return Object.values(RTI_FILING_TYPES).includes(filingType as RTIFilingType) ||
         Object.values(CIS_FILING_TYPES).includes(filingType as CISFilingType);
}

export function isRTIFilingType(filingType: string): boolean {
  return Object.values(RTI_FILING_TYPES).includes(filingType as RTIFilingType);
}

export function isCISFilingType(filingType: string): boolean {
  return Object.values(CIS_FILING_TYPES).includes(filingType as CISFilingType);
}

// ==================== INTERFACES ====================

export interface FilingSubmissionRequest {
  filingId: string;
  filingType: string;
  filingBody: string;
  filingData: Record<string, any>;
  taxYear?: string;
  periodStart?: string;
  periodEnd?: string;
  clientId?: string;
  companyId?: string;
  organizationId: string;
}

export interface FilingSubmissionResponse {
  success: boolean;
  submissionId?: string;
  filingReference?: string;
  status: "accepted" | "pending" | "rejected" | "error";
  message?: string;
  validationErrors?: FilingValidationError[];
  rawResponse?: Record<string, any>;
}

export interface FilingValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface FilingStatusCheckRequest {
  submissionId: string;
  filingBody: string;
}

export interface FilingStatusResponse {
  success: boolean;
  status: "pending" | "accepted" | "rejected" | "processing";
  filingReference?: string;
  message?: string;
  rawResponse?: Record<string, any>;
}

// ==================== PROVIDER INTERFACE ====================

export interface FilingAPIProvider {
  name: string;
  filingBody: string;
  isProduction: boolean;
  
  submitFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse>;
  checkStatus(request: FilingStatusCheckRequest): Promise<FilingStatusResponse>;
  validateFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]>;
}

// ==================== HMRC SANDBOX PROVIDER (UNIFIED) ====================

export class HMRCSandboxProvider implements FilingAPIProvider {
  name = "HMRC Sandbox";
  filingBody = "HMRC";
  isProduction = false;
  
  async submitFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    console.log(`[HMRC Sandbox] Submitting ${request.filingType} for tax year ${request.taxYear}`);
    
    // Route to appropriate submission handler based on filing type
    if (isRTIFilingType(request.filingType)) {
      return this.submitRTIFiling(request);
    }
    
    if (isCISFilingType(request.filingType)) {
      return this.submitCISFiling(request);
    }
    
    // Standard HMRC filings (SA, CT, VAT)
    return this.submitStandardFiling(request);
  }
  
  private async submitStandardFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    // T1-19/DEAD-1: this used to return status:"accepted" with an invented filing reference after a
    // simulated delay. submitFilingToAuthority writes that result straight onto the filing's
    // api_response/api_submission_id, so wiring SA/CT/VAT through here would record a statutory
    // filing as accepted by HMRC when nothing was ever transmitted. A fabricated acceptance is
    // worse than an error: it is indistinguishable from a real one after the fact.
    //
    // Real transport lives in the hmrc-*-submit edge functions (hmrc-vat-submit, hmrc-ct-submit),
    // which submit from an approved, frozen model snapshot per the CLAUDE.md filing contract.
    throw new Error(
      `HMRCSandboxProvider: ${request.filingType} submission is not implemented. ` +
        `Use the hmrc-*-submit edge functions, which submit from an approved model snapshot.`,
    );
  }
  
  private async submitRTIFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    console.log(`[HMRC RTI] Submitting ${request.filingType} via edge function`);
    
    const validationErrors = await this.validateRTIFiling(request);
    if (validationErrors.length > 0) {
      return {
        success: false,
        status: "rejected",
        message: "RTI validation failed",
        validationErrors,
      };
    }

    try {
      // Build XML from filing data
      const filingData = request.filingData;
      const payRunData: FPSPayRunData = {
        payeReference: filingData.paye_reference || '',
        accountsOfficeReference: filingData.accounts_office_ref || '',
        taxYear: request.taxYear || '',
        taxMonth: filingData.tax_month || 1,
        paymentDate: filingData.payment_date || '',
        periodStart: request.periodStart || '',
        periodEnd: request.periodEnd || '',
        payFrequency: filingData.pay_frequency || 'monthly',
        isLateFiling: filingData.is_late_filing,
        lateFilingReason: filingData.late_filing_reason,
      };

      const employees: FPSEmployeeData[] = filingData.employees || [];
      
      // Generate XML based on filing type
      let xmlPayload: string;
      let messageType: 'FPS' | 'EPS' | 'P45' | 'P46' | 'EYU' | 'NVR';
      
      if (request.filingType === RTI_FILING_TYPES.FPS) {
        xmlPayload = generateFPSXml(payRunData, employees);
        messageType = 'FPS';
      } else if (request.filingType === RTI_FILING_TYPES.EPS) {
        const epsData: EPSData = {
          payeReference: filingData.paye_reference || '',
          accountsOfficeReference: filingData.accounts_office_ref || '',
          taxYear: request.taxYear || '',
          taxMonth: filingData.tax_month || 1,
          ...filingData.eps_data,
        };
        xmlPayload = generateEPSXml(payRunData, epsData);
        messageType = 'EPS';
      } else {
        // Default to FPS format for other RTI types
        xmlPayload = generateFPSXml(payRunData, employees);
        messageType = request.filingType.replace('RTI_', '') as any;
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke('rti-submit', {
        body: {
          filingId: request.filingId,
          messageType,
          xmlPayload,
          organizationId: request.organizationId,
          payRunId: filingData.pay_run_id,
          taxYear: request.taxYear,
          taxMonth: filingData.tax_month,
        },
      });

      if (error) {
        console.error('[HMRC RTI] Edge function error:', error);
        return {
          success: false,
          status: "error",
          message: error.message || "RTI submission failed",
        };
      }

      return {
        success: data.success,
        submissionId: data.correlationId,
        filingReference: data.hmrcReference,
        status: data.success ? "accepted" : "rejected",
        message: data.message,
        rawResponse: {
          environment: "sandbox",
          timestamp: new Date().toISOString(),
          filingType: request.filingType,
          correlationId: data.correlationId,
          submissionId: data.submissionId,
        },
      };
    } catch (err: any) {
      console.error('[HMRC RTI] Submission error:', err);
      return {
        success: false,
        status: "error",
        message: err.message || "RTI submission failed",
      };
    }
  }
  
  private async submitCISFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    console.log(`[HMRC CIS] Submitting ${request.filingType} via edge function`);
    
    const validationErrors = await this.validateCISFiling(request);
    if (validationErrors.length > 0) {
      return {
        success: false,
        status: "rejected",
        message: "CIS validation failed",
        validationErrors,
      };
    }

    try {
      const filingData = request.filingData;
      
      // Build CIS return data from filing_data
      const returnData: CISReturnData = {
        contractor: {
          contractorUTR: filingData.contractor_utr || '',
          contractorName: filingData.contractor_name || '',
          accountsOfficeReference: filingData.accounts_office_ref || '',
          payeReference: filingData.paye_reference,
        },
        taxYear: request.taxYear || '',
        taxMonth: filingData.tax_month || 1,
        periodStart: request.periodStart || '',
        periodEnd: request.periodEnd || '',
        dueDate: filingData.due_date || '',
        employmentStatusDeclaration: filingData.employment_declaration || false,
        subcontractorVerificationDeclaration: filingData.verification_declaration || false,
        nilReturn: filingData.nil_return || false,
      };

      const subcontractors: CISSubcontractorData[] = filingData.subcontractors || [];
      const payments: CISPaymentData[] = filingData.payments || [];

      // Generate XML
      const xmlPayload = generateCISReturnXml(returnData, subcontractors, payments);

      // Call edge function
      const { data, error } = await supabase.functions.invoke('cis-submit', {
        body: {
          filingId: request.filingId,
          returnType: request.filingType === CIS_FILING_TYPES.VERIFICATION ? 'VERIFICATION' : 'MONTHLY_RETURN',
          xmlPayload,
          organizationId: request.organizationId,
          cisReturnId: filingData.cis_return_id,
          taxYear: request.taxYear,
          taxMonth: filingData.tax_month,
        },
      });

      if (error) {
        console.error('[HMRC CIS] Edge function error:', error);
        return {
          success: false,
          status: "error",
          message: error.message || "CIS submission failed",
        };
      }

      return {
        success: data.success,
        submissionId: data.correlationId,
        filingReference: data.hmrcReference || data.hmrcReceiptNumber,
        status: data.success ? "accepted" : "rejected",
        message: data.message,
        rawResponse: {
          environment: "sandbox",
          timestamp: new Date().toISOString(),
          filingType: request.filingType,
          correlationId: data.correlationId,
          hmrcReceiptNumber: data.hmrcReceiptNumber,
        },
      };
    } catch (err: any) {
      console.error('[HMRC CIS] Submission error:', err);
      return {
        success: false,
        status: "error",
        message: err.message || "CIS submission failed",
      };
    }
  }
  
  async checkStatus(request: FilingStatusCheckRequest): Promise<FilingStatusResponse> {
    console.log(`[HMRC Sandbox] Checking status for ${request.submissionId}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      success: true,
      status: "accepted",
      filingReference: `HMRC-${Date.now().toString(36).toUpperCase()}`,
      message: "Filing processed successfully (sandbox mode)",
    };
  }
  
  async validateFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]> {
    // Route to specific validation based on filing type
    if (isRTIFilingType(request.filingType)) {
      return this.validateRTIFiling(request);
    }
    
    if (isCISFilingType(request.filingType)) {
      return this.validateCISFiling(request);
    }
    
    return this.validateStandardFiling(request);
  }
  
  private async validateStandardFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]> {
    const errors: FilingValidationError[] = [];
    
    // Basic validation
    if (!request.filingType) {
      errors.push({ field: "filingType", message: "Filing type is required", code: "MISSING_FIELD" });
    }
    
    if (!request.taxYear && !request.periodEnd) {
      errors.push({ field: "taxYear", message: "Tax year or period end is required", code: "MISSING_FIELD" });
    }
    
    // SA-specific validation
    if (request.filingType === "SA100" || request.filingType === "self_assessment") {
      if (!request.clientId) {
        errors.push({ field: "clientId", message: "Client ID required for SA filing", code: "MISSING_CLIENT" });
      }
      
      const utr = request.filingData?.utr;
      if (!utr || !/^\d{10}$/.test(String(utr))) {
        errors.push({ field: "utr", message: "Valid 10-digit UTR required", code: "INVALID_UTR" });
      }
    }
    
    // CT-specific validation
    if (request.filingType === "CT600" || request.filingType === "corporation_tax") {
      if (!request.companyId) {
        errors.push({ field: "companyId", message: "Company ID required for CT filing", code: "MISSING_COMPANY" });
      }
      
      const companyNumber = request.filingData?.company_number;
      if (!companyNumber || !/^[A-Z0-9]{8}$/.test(String(companyNumber))) {
        errors.push({ field: "company_number", message: "Valid company number required", code: "INVALID_COMPANY_NUMBER" });
      }
    }
    
    return errors;
  }
  
  private async validateRTIFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]> {
    const errors: FilingValidationError[] = [];
    
    if (!request.filingType) {
      errors.push({ field: "filingType", message: "Filing type is required", code: "MISSING_FIELD" });
    }
    
    // Validate PAYE reference
    const payeRef = request.filingData?.paye_reference;
    if (!payeRef || !/^\d{3}\/[A-Z0-9]+$/.test(String(payeRef))) {
      errors.push({ field: "paye_reference", message: "Valid PAYE reference required (format: XXX/XXXXX)", code: "INVALID_PAYE_REF" });
    }
    
    // Validate Accounts Office Reference
    const aoRef = request.filingData?.accounts_office_reference;
    if (!aoRef) {
      errors.push({ field: "accounts_office_reference", message: "Accounts Office Reference required", code: "MISSING_AO_REF" });
    }
    
    // FPS-specific validation
    if (request.filingType === RTI_FILING_TYPES.FPS) {
      const employees = request.filingData?.employees;
      if (!employees || !Array.isArray(employees) || employees.length === 0) {
        errors.push({ field: "employees", message: "At least one employee required for FPS", code: "NO_EMPLOYEES" });
      }
    }
    
    return errors;
  }
  
  private async validateCISFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]> {
    const errors: FilingValidationError[] = [];
    
    if (!request.filingType) {
      errors.push({ field: "filingType", message: "Filing type is required", code: "MISSING_FIELD" });
    }
    
    // Validate contractor UTR
    const contractorUTR = request.filingData?.contractor_utr;
    if (!contractorUTR || !/^\d{10}$/.test(String(contractorUTR))) {
      errors.push({ field: "contractor_utr", message: "Valid 10-digit contractor UTR required", code: "INVALID_UTR" });
    }
    
    // Validate not a nil return without declaration
    const isNilReturn = request.filingData?.nil_return;
    const payments = request.filingData?.payments;
    if (!isNilReturn && (!payments || !Array.isArray(payments) || payments.length === 0)) {
      errors.push({ field: "payments", message: "Payments required for non-nil return", code: "NO_PAYMENTS" });
    }
    
    return errors;
  }
  
  // generateMockReference removed with the fabricated-acceptance path above (T1-19): its only
  // caller was submitStandardFiling. The RTI/CIS providers keep their own.
}

// ==================== COMPANIES HOUSE SANDBOX PROVIDER ====================

export class CompaniesHouseSandboxProvider implements FilingAPIProvider {
  name = "Companies House Sandbox";
  filingBody = "COMPANIES_HOUSE";
  isProduction = false;
  
  async submitFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    console.log(`[CH Sandbox] Submitting ${request.filingType} for company ${request.companyId}`);
    
    const validationErrors = await this.validateFiling(request);
    if (validationErrors.length > 0) {
      return {
        success: false,
        status: "rejected",
        message: "Validation failed",
        validationErrors,
      };
    }
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const submissionId = `CH-SB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filingReference = this.generateMockReference();
    
    return {
      success: true,
      submissionId,
      filingReference,
      status: "accepted",
      message: "Filing accepted (sandbox mode)",
      rawResponse: {
        environment: "sandbox",
        timestamp: new Date().toISOString(),
        filingType: request.filingType,
      },
    };
  }
  
  async checkStatus(request: FilingStatusCheckRequest): Promise<FilingStatusResponse> {
    console.log(`[CH Sandbox] Checking status for ${request.submissionId}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      success: true,
      status: "accepted",
      filingReference: `CH-${Date.now().toString(36).toUpperCase()}`,
      message: "Filing processed successfully (sandbox mode)",
    };
  }
  
  async validateFiling(request: FilingSubmissionRequest): Promise<FilingValidationError[]> {
    const errors: FilingValidationError[] = [];
    
    if (!request.companyId) {
      errors.push({ field: "companyId", message: "Company ID is required", code: "MISSING_COMPANY" });
    }
    
    if (!request.periodEnd) {
      errors.push({ field: "periodEnd", message: "Accounting period end date is required", code: "MISSING_PERIOD" });
    }
    
    // Validate company number format
    const companyNumber = request.filingData?.company_number;
    if (!companyNumber || !/^[A-Z0-9]{8}$/.test(String(companyNumber))) {
      errors.push({ field: "company_number", message: "Valid 8-character company number required", code: "INVALID_COMPANY_NUMBER" });
    }
    
    return errors;
  }
  
  private generateMockReference(): string {
    const random = Math.random().toString(36).substr(2, 8).toUpperCase();
    return `CH-${random}`;
  }
}

// ==================== PROVIDER FACTORY ====================

// Single HMRC provider handles all HMRC filings (SA, CT, VAT, RTI, CIS)
const providers: Record<string, FilingAPIProvider> = {
  HMRC: new HMRCSandboxProvider(),
  COMPANIES_HOUSE: new CompaniesHouseSandboxProvider(),
};

export function getFilingProvider(filingBody: string): FilingAPIProvider | null {
  return providers[filingBody] || null;
}

export function registerFilingProvider(filingBody: string, provider: FilingAPIProvider): void {
  providers[filingBody] = provider;
}

export function getAvailableProviders(): string[] {
  return Object.keys(providers);
}

// ==================== CONVENIENCE FUNCTIONS ====================

// submitFilingToAuthorityViaProvider removed (T1-19/DEAD-1): it had no importers anywhere and
// offered a second, unguarded route into the provider's submit path. filing-service's
// submitFilingToAuthority is the one entry point.

export async function checkFilingStatus(
  submissionId: string,
  filingBody: string
): Promise<FilingStatusResponse> {
  const provider = getFilingProvider(filingBody);
  if (!provider) {
    return {
      success: false,
      status: "pending",
      message: `No provider available for ${filingBody}`,
    };
  }
  
  return provider.checkStatus({ submissionId, filingBody });
}

export async function validateFilingData(
  request: FilingSubmissionRequest
): Promise<FilingValidationError[]> {
  const provider = getFilingProvider(request.filingBody);
  if (!provider) {
    return [{ field: "filingBody", message: `No provider available for ${request.filingBody}`, code: "NO_PROVIDER" }];
  }
  
  return provider.validateFiling(request);
}

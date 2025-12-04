/**
 * Filing API Abstraction Layer
 * Provides a clean interface for filing submissions to HMRC/Companies House
 * Currently implements sandbox providers - production providers can be dropped in
 */

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

// ==================== HMRC SANDBOX PROVIDER ====================

export class HMRCSandboxProvider implements FilingAPIProvider {
  name = "HMRC Sandbox";
  filingBody = "HMRC";
  isProduction = false;
  
  async submitFiling(request: FilingSubmissionRequest): Promise<FilingSubmissionResponse> {
    // Sandbox simulation - validates data structure and returns mock response
    console.log(`[HMRC Sandbox] Submitting ${request.filingType} for tax year ${request.taxYear}`);
    
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
    
    // Generate mock submission ID and reference
    const submissionId = `HMRC-SB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filingReference = this.generateMockReference(request.filingType);
    
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
        taxYear: request.taxYear,
      },
    };
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
  
  private generateMockReference(filingType: string): string {
    const prefix = filingType.includes("SA") ? "SA" : filingType.includes("CT") ? "CT" : "TX";
    const random = Math.random().toString(36).substr(2, 8).toUpperCase();
    return `${prefix}-${random}`;
  }
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

export async function submitFilingToAuthority(
  request: FilingSubmissionRequest
): Promise<FilingSubmissionResponse> {
  const provider = getFilingProvider(request.filingBody);
  if (!provider) {
    return {
      success: false,
      status: "error",
      message: `No provider available for ${request.filingBody}`,
    };
  }
  
  return provider.submitFiling(request);
}

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

import { supabase } from "@/integrations/supabase/client";

export type FilingStatus = 
  | "not_started" 
  | "draft" 
  | "in_progress" 
  | "awaiting_approval" 
  | "approved" 
  | "ready_to_file" 
  | "filed" 
  | "rejected";

export interface FilingDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  generated_at: string;
}

export interface CreateFilingParams {
  jobId: string;
  workpaperInstanceId: string;
  filingType: string;
  filingBody: string;
  taxYear?: string;
  periodStart?: string;
  periodEnd?: string;
  clientId?: string;
  companyId?: string;
  organizationId: string;
}

export async function createFilingFromWorkpaper(params: CreateFilingParams): Promise<{ success: boolean; filingId?: string; error?: string }> {
  try {
    // Check if filing already exists for this job
    const { data: existing } = await supabase
      .from("filings")
      .select("id")
      .eq("job_id", params.jobId)
      .maybeSingle();

    if (existing) {
      return { success: true, filingId: existing.id };
    }

    // Fetch workpaper data to populate filing
    const { data: workpaper, error: wpError } = await supabase
      .from("workpaper_instances")
      .select("*")
      .eq("id", params.workpaperInstanceId)
      .single();

    if (wpError || !workpaper) {
      return { success: false, error: "Workpaper not found" };
    }

    const fieldValues = workpaper.field_values as Record<string, any> || {};
    
    // Extract tax calculations from workpaper
    const taxDue = fieldValues.tax_due || fieldValues.corporation_tax_due || fieldValues.income_tax_due || 0;
    const taxRefund = fieldValues.tax_refund || 0;

    const { data: filing, error } = await supabase
      .from("filings")
      .insert({
        job_id: params.jobId,
        workpaper_instance_id: params.workpaperInstanceId,
        filing_type: params.filingType,
        filing_body: params.filingBody,
        tax_year: params.taxYear,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        client_id: params.clientId,
        company_id: params.companyId,
        organization_id: params.organizationId,
        status: "draft",
        filing_data: fieldValues,
        tax_due: taxDue,
        tax_refund: taxRefund,
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, filingId: filing.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateFilingStatus(
  filingId: string, 
  status: FilingStatus,
  additionalData?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, any> = { status, ...additionalData };

    if (status === "filed") {
      updateData.filed_at = new Date().toISOString();
      updateData.is_locked = true;
    }

    const { error } = await supabase
      .from("filings")
      .update(updateData)
      .eq("id", filingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendFilingForApproval(
  filingId: string,
  clientId: string | null,
  companyId: string | null,
  organizationId: string,
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update filing status
    const { error: filingError } = await supabase
      .from("filings")
      .update({
        status: "awaiting_approval",
        approval_requested_at: new Date().toISOString(),
      })
      .eq("id", filingId);

    if (filingError) {
      return { success: false, error: filingError.message };
    }

    // Create client task for approval
    const { error: taskError } = await supabase
      .from("client_tasks")
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        title: "Review and approve filing",
        description: "Please review the filing documents and approve for submission to the relevant authority.",
        status: "not_started",
        visibility: "client_visible",
      });

    if (taskError) {
      console.error("Failed to create approval task:", taskError);
    }

    // Queue email notification (placeholder - would integrate with email service)
    const { error: emailError } = await supabase
      .from("email_queue")
      .insert({
        organization_id: organizationId,
        to_email: "client@example.com", // Would fetch from client record
        subject: "Filing ready for your approval",
        body_html: `<p>Your filing is ready for review. Please log in to your portal to review and approve.</p>`,
        entity_type: "filing",
        entity_id: filingId,
        status: "pending",
      });

    if (emailError) {
      console.error("Failed to queue email:", emailError);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function approveFilingByClient(
  filingId: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("filings")
      .update({
        status: "ready_to_file",
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
      })
      .eq("id", filingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function rejectFilingByClient(
  filingId: string,
  rejectionReason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("filings")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
      })
      .eq("id", filingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function markFilingAsFiled(
  filingId: string,
  filedBy: string,
  filingReference?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("filings")
      .update({
        status: "filed",
        filed_at: new Date().toISOString(),
        filed_by: filedBy,
        filing_reference: filingReference,
        is_locked: true,
      })
      .eq("id", filingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Document generation placeholders - would integrate with PDF generation service
export function getDocumentTypesForFiling(filingType: string): string[] {
  switch (filingType) {
    case "self_assessment":
    case "SA100":
      return ["Client Summary PDF", "HMRC SA100 PDF", "Tax Computation"];
    case "ct600":
    case "corporation_tax":
      return ["Full Accounts PDF", "Abridged Accounts PDF", "CT600 Return", "Tax Computation"];
    case "vat_return":
      return ["VAT Summary PDF", "VAT100 Return"];
    case "payroll":
    case "rti":
      return ["RTI Summary PDF", "P60s"];
    case "companies_house":
      return ["Full Accounts PDF", "Abridged Accounts PDF"];
    default:
      return ["Filing Summary PDF"];
  }
}

export async function generateFilingDocuments(
  filingId: string,
  filingType: string
): Promise<{ success: boolean; documents?: FilingDocument[]; error?: string }> {
  // Placeholder - would integrate with PDF generation service
  const documentTypes = getDocumentTypesForFiling(filingType);
  
  const documents: FilingDocument[] = documentTypes.map((type, index) => ({
    id: `doc_${filingId}_${index}`,
    name: type,
    type: type.toLowerCase().replace(/ /g, "_"),
    generated_at: new Date().toISOString(),
  }));

  // Update filing with generated documents - use JSON parse/stringify for proper type
  const { error } = await supabase
    .from("filings")
    .update({
      generated_documents: JSON.parse(JSON.stringify(documents)),
    })
    .eq("id", filingId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, documents };
}

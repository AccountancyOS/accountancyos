import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";

interface ServiceResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Submit CIS return to HMRC via filing spine
 * Per CTO: All filings go through filing spine → provider → edge function
 */
export async function submitCISReturn(
  cisReturnId: string,
  userId: string,
  employmentDeclaration: boolean,
  verificationDeclaration: boolean
): Promise<ServiceResult> {
  try {
    if (!employmentDeclaration || !verificationDeclaration) {
      return {
        success: false,
        error: "Both declarations must be confirmed before submission"
      };
    }

    // Import filing service functions
    const { createCISFilingFromReturn, submitPayrollFiling } = await import("@/lib/filing-service");

    // Fetch CIS return to validate
    const { data: cisReturn, error: fetchError } = await supabase
      .from("cis_returns")
      .select(`
        *,
        cis_contractors (
          id,
          name,
          contractor_utr,
          accounts_office_reference,
          company_id,
          client_id,
          organization_id
        )
      `)
      .eq("id", cisReturnId)
      .single();

    if (fetchError) throw new Error(`CIS return not found: ${fetchError.message}`);

    if (cisReturn.status === "submitted") {
      return { success: false, error: "CIS return has already been submitted" };
    }

    const organizationId = cisReturn.cis_contractors?.organization_id || cisReturn.organization_id;

    // Update declarations on CIS return before creating filing
    await supabase
      .from("cis_returns")
      .update({
        employment_status_declaration: employmentDeclaration,
        subcontractor_verification_declaration: verificationDeclaration,
      })
      .eq("id", cisReturnId);

    // Step 1: Create filing with status "draft" via filing service
    const createResult = await createCISFilingFromReturn(cisReturnId);
    if (!createResult.success || !createResult.filingId) {
      return { success: false, error: createResult.error || "Failed to create CIS filing" };
    }

    // Step 2: Submit via filing spine (draft → ready_to_file → provider → filed)
    const submitResult = await submitPayrollFiling(createResult.filingId, userId);
    
    if (!submitResult.success) {
      return { success: false, error: submitResult.error || "CIS submission failed" };
    }

    // Update CIS return status
    const { error: updateError } = await supabase
      .from("cis_returns")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
        filing_id: createResult.filingId,
      })
      .eq("id", cisReturnId);

    if (updateError) throw new Error(`Failed to update CIS return: ${updateError.message}`);

    // Update all payments in this return to submitted
    await supabase
      .from("cis_payments")
      .update({ status: "submitted" })
      .eq("cis_return_id", cisReturnId);

    // Log audit
    await logAudit({
      organizationId,
      entityType: "cis_return",
      entityId: cisReturnId,
      action: "submit",
      fieldName: "status",
      oldValue: cisReturn.status,
      newValue: "submitted",
      metadata: { filing_id: createResult.filingId, filing_reference: submitResult.filingReference },
    });

    return { success: true, data: { filingId: createResult.filingId, filingReference: submitResult.filingReference } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Get CIS return summary for display
 */
export async function getCISReturnSummary(cisReturnId: string): Promise<ServiceResult> {
  try {
    const { data: cisReturn, error } = await supabase
      .from("cis_returns")
      .select(`
        *,
        cis_contractors (
          name,
          contractor_utr,
          accounts_office_reference
        ),
        cis_payments (
          id,
          gross_amount,
          materials_amount,
          labour_amount,
          deduction_amount,
          deduction_rate,
          cis_subcontractors (
            first_name,
            last_name,
            business_name,
            trading_name,
            utr
          )
        )
      `)
      .eq("id", cisReturnId)
      .single();

    if (error) throw new Error(error.message);

    return { success: true, data: cisReturn };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

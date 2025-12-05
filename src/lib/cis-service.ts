import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";

interface ServiceResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Submit CIS return to HMRC
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

    // Fetch CIS return
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
    const entityId = cisReturn.cis_contractors?.company_id || cisReturn.cis_contractors?.client_id;
    const entityType = cisReturn.cis_contractors?.company_id ? 'company' : 'client';

    // Create filing record
    const { data: filing, error: filingError } = await supabase
      .from("filings")
      .insert({
        organization_id: organizationId,
        company_id: entityType === 'company' ? entityId : null,
        client_id: entityType === 'client' ? entityId : null,
        filing_type: "CIS_RETURN",
        filing_body: "HMRC",
        tax_year: cisReturn.tax_year,
        period_start: cisReturn.period_start,
        period_end: cisReturn.period_end,
        status: "filed",
        filed_at: new Date().toISOString(),
        filing_data: {
          cis_return_id: cisReturnId,
          contractor_utr: cisReturn.cis_contractors?.contractor_utr,
          accounts_office_ref: cisReturn.cis_contractors?.accounts_office_reference,
          tax_month: cisReturn.tax_month,
          total_gross: cisReturn.total_gross_amount,
          total_deductions: cisReturn.total_deductions,
          total_materials: cisReturn.total_materials_amount,
          payments_count: cisReturn.total_payments_count,
          employment_declaration: employmentDeclaration,
          verification_declaration: verificationDeclaration,
        },
      } as any)
      .select("id")
      .single();

    if (filingError) throw new Error(`Failed to create filing: ${filingError.message}`);

    // Update CIS return status
    const { error: updateError } = await supabase
      .from("cis_returns")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
        employment_status_declaration: employmentDeclaration,
        subcontractor_verification_declaration: verificationDeclaration,
        filing_id: filing.id,
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
      metadata: { filing_id: filing.id },
    });

    return { success: true, data: { filingId: filing.id } };
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

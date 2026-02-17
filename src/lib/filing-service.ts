import { supabase } from "@/integrations/supabase/client";
import { logAudit, checkCanFinalise } from "@/lib/audit-service";
import { executeAutoRollover } from "@/lib/auto-rollover-service";
import { emitFilingSubmittedEvent, emitFilingAcceptedEvent, emitFilingRejectedEvent } from "@/lib/filing-event-service";
import { isPayrollFilingType } from "@/lib/filing-api-provider";

export type FilingStatus = 
  | "not_started" 
  | "draft" 
  | "in_progress" 
  | "ready_for_review"
  | "sent_to_client"
  | "client_changes_requested"
  | "awaiting_approval" 
  | "approved" 
  | "ready_to_file" 
  | "submitted"
  | "accepted"
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
    
    // Extract tax calculations from workpaper field_values
    // These come from the tax calculation engine integrated into workpaper-from-tb.ts
    const taxBreakdown = extractTaxBreakdown(fieldValues, params.filingType);
    
    const taxDue = taxBreakdown.totalTaxDue || 0;
    const taxRefund = taxBreakdown.totalRefund || 0;
    const paymentDeadline = calculatePaymentDeadline(params.filingType, params.periodEnd);

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
        filing_data: {
          ...fieldValues,
          tax_calculation_breakdown: taxBreakdown,
        },
        tax_due: taxDue,
        tax_refund: taxRefund,
        payment_deadline: paymentDeadline,
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Log audit
    await logAudit({
      organizationId: params.organizationId,
      entityType: "filing",
      entityId: filing.id,
      action: "create",
      metadata: { source: "workpaper", workpaper_id: params.workpaperInstanceId },
    });

    return { success: true, filingId: filing.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Extract tax breakdown from workpaper field values based on filing type
 */
function extractTaxBreakdown(fieldValues: Record<string, any>, filingType: string): Record<string, any> {
  const breakdown: Record<string, any> = {};
  
  if (filingType === "self_assessment" || filingType === "SA100") {
    // Self Assessment tax breakdown
    breakdown.totalIncome = getFieldAmount(fieldValues, "sa.total_income") || getFieldAmount(fieldValues, "total_income");
    breakdown.personalAllowance = getFieldAmount(fieldValues, "sa.personal_allowance") || getFieldAmount(fieldValues, "personal_allowance");
    breakdown.taxableIncome = getFieldAmount(fieldValues, "sa.taxable_income") || getFieldAmount(fieldValues, "taxable_income");
    breakdown.incomeTax = getFieldAmount(fieldValues, "sa.income_tax") || getFieldAmount(fieldValues, "income_tax");
    breakdown.class2NIC = getFieldAmount(fieldValues, "sa.class_2_nic") || 0;
    breakdown.class4NIC = getFieldAmount(fieldValues, "sa.class_4_nic") || 0;
    breakdown.totalNIC = getFieldAmount(fieldValues, "sa.total_nic") || getFieldAmount(fieldValues, "national_insurance");
    breakdown.totalTaxDue = getFieldAmount(fieldValues, "sa.total_tax") || getFieldAmount(fieldValues, "total_tax_due");
    breakdown.firstPOA = getFieldAmount(fieldValues, "sa.poas.first") || 0;
    breakdown.secondPOA = getFieldAmount(fieldValues, "sa.poas.second") || 0;
    breakdown.totalRefund = getFieldAmount(fieldValues, "sa.refund") || 0;
  } else if (filingType === "ct600" || filingType === "corporation_tax") {
    // Corporation Tax breakdown
    breakdown.tradingProfit = getFieldAmount(fieldValues, "trading_profit");
    breakdown.profitsChargeable = getFieldAmount(fieldValues, "profits_chargeable") || getFieldAmount(fieldValues, "ct.taxable_profits");
    breakdown.corporationTax = getFieldAmount(fieldValues, "corporation_tax") || getFieldAmount(fieldValues, "ct.corporation_tax");
    breakdown.marginalRelief = getFieldAmount(fieldValues, "ct.marginal_relief") || 0;
    breakdown.totalTaxDue = getFieldAmount(fieldValues, "ct.ct_payable") || breakdown.corporationTax;
    breakdown.totalRefund = 0;
  } else if (filingType === "vat_return") {
    // VAT breakdown
    breakdown.box1 = getFieldAmount(fieldValues, "box1_vat_due_sales");
    breakdown.box2 = getFieldAmount(fieldValues, "box2_vat_due_acquisitions");
    breakdown.box3 = getFieldAmount(fieldValues, "box3_total_vat_due");
    breakdown.box4 = getFieldAmount(fieldValues, "box4_vat_reclaimed");
    breakdown.box5 = getFieldAmount(fieldValues, "box5_net_vat");
    breakdown.box6 = getFieldAmount(fieldValues, "box6_total_sales");
    breakdown.box7 = getFieldAmount(fieldValues, "box7_total_purchases");
    breakdown.box8 = getFieldAmount(fieldValues, "box8_goods_to_eu");
    breakdown.box9 = getFieldAmount(fieldValues, "box9_goods_from_eu");
    
    const netVat = breakdown.box5 || 0;
    breakdown.totalTaxDue = netVat > 0 ? netVat : 0;
    breakdown.totalRefund = netVat < 0 ? Math.abs(netVat) : 0;
  }
  
  return breakdown;
}

function getFieldAmount(fieldValues: Record<string, any>, key: string): number {
  const value = fieldValues[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    return value.amount || 0;
  }
  return 0;
}

function calculatePaymentDeadline(filingType: string, periodEnd?: string): string | null {
  if (!periodEnd) return null;
  
  const endDate = new Date(periodEnd);
  
  if (filingType === "self_assessment" || filingType === "SA100") {
    // SA payment due 31 January following tax year end
    const taxYearEnd = new Date(endDate.getFullYear(), 3, 5); // 5th April
    if (endDate > taxYearEnd) {
      return `${endDate.getFullYear() + 1}-01-31`;
    }
    return `${endDate.getFullYear()}-01-31`;
  } else if (filingType === "ct600" || filingType === "corporation_tax") {
    // CT payment due 9 months + 1 day after period end
    const paymentDate = new Date(endDate);
    paymentDate.setMonth(paymentDate.getMonth() + 9);
    paymentDate.setDate(paymentDate.getDate() + 1);
    return paymentDate.toISOString().split('T')[0];
  } else if (filingType === "vat_return") {
    // VAT due 1 month + 7 days after quarter end
    const paymentDate = new Date(endDate);
    paymentDate.setMonth(paymentDate.getMonth() + 1);
    paymentDate.setDate(paymentDate.getDate() + 7);
    return paymentDate.toISOString().split('T')[0];
  }
  
  return null;
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
    // Generate approval token via RPC
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('generate_filing_approval_token', { p_filing_id: filingId });

    if (tokenError) {
      console.error("Failed to generate approval token:", tokenError);
      // Continue without token - will use fallback
    }

    const approvalToken = tokenData || crypto.randomUUID();

    // Update filing status with approval token
    const { error: filingError } = await supabase
      .from("filings")
      .update({
        status: "awaiting_approval",
        approval_requested_at: new Date().toISOString(),
        approval_token: approvalToken,
        approval_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .eq("id", filingId);

    if (filingError) {
      return { success: false, error: filingError.message };
    }

    // Get filing details for email
    const { data: filing } = await supabase
      .from("filings")
      .select("tax_due, tax_refund, filing_type, tax_year")
      .eq("id", filingId)
      .single();

    // Get client/company email
    let recipientEmail = "";
    let recipientName = "";
    
    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("email, company_name")
        .eq("id", companyId)
        .single();
      recipientEmail = company?.email || "";
      recipientName = company?.company_name || "";
    } else if (clientId) {
      const { data: client } = await supabase
        .from("clients")
        .select("email, first_name, last_name")
        .eq("id", clientId)
        .single();
      recipientEmail = client?.email || "";
      recipientName = `${client?.first_name} ${client?.last_name}`;
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

    // Try to send via connected mailbox first
    const emailSent = await sendApprovalEmailViaMailbox(
      organizationId,
      recipientEmail,
      recipientName,
      filing,
      filingId,
      approvalToken
    );

    // If mailbox send fails, queue via email_queue as fallback
    if (!emailSent && recipientEmail) {
      const portalUrl = `${window.location.origin}/portal/filings/${filingId}?token=${approvalToken}`;
      const taxAmount = (filing?.tax_due || 0) > 0 
        ? `Tax Due: £${(filing?.tax_due || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
        : `Tax Refund: £${(filing?.tax_refund || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

      await supabase
        .from("email_queue")
        .insert({
          organization_id: organizationId,
          to_email: recipientEmail,
          to_name: recipientName,
          subject: `Filing Ready for Your Approval - ${filing?.filing_type} ${filing?.tax_year || ''}`,
          body_html: `
            <p>Dear ${recipientName},</p>
            <p>Your ${filing?.filing_type} filing is ready for your review and approval.</p>
            <p><strong>${taxAmount}</strong></p>
            <p>Please <a href="${portalUrl}">click here to review and approve</a> the filing documents.</p>
            <p>This link will expire in 7 days.</p>
            <p>If you have any questions, please contact us.</p>
          `,
          entity_type: "filing",
          entity_id: filingId,
          status: "queued",
        });
    }

    // Log audit
    await logAudit({
      organizationId,
      entityType: "filing",
      entityId: filingId,
      action: "send_for_approval",
      metadata: { recipient: recipientEmail, method: emailSent ? 'connected_mailbox' : 'email_queue' },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Send approval email via connected mailbox (Gmail/Outlook)
 */
async function sendApprovalEmailViaMailbox(
  organizationId: string,
  recipientEmail: string,
  recipientName: string,
  filing: any,
  filingId: string,
  approvalToken: string
): Promise<boolean> {
  try {
    if (!recipientEmail) return false;

    // Get connected mailbox for organization
    const { data: mailbox } = await supabase
      .from("connected_mailboxes")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!mailbox) {
      console.log("No connected mailbox found, falling back to email queue");
      return false;
    }

    const portalUrl = `${window.location.origin}/portal/filings/${filingId}?token=${approvalToken}`;
    const taxAmount = (filing?.tax_due || 0) > 0 
      ? `Tax Due: £${(filing?.tax_due || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
      : `Tax Refund: £${(filing?.tax_refund || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

    const subject = `Filing Ready for Your Approval - ${filing?.filing_type} ${filing?.tax_year || ''}`;
    const body = `
      <p>Dear ${recipientName},</p>
      <p>Your ${filing?.filing_type} filing is ready for your review and approval.</p>
      <p><strong>${taxAmount}</strong></p>
      <p>Please <a href="${portalUrl}">click here to review and approve</a> the filing documents.</p>
      <p>This link will expire in 7 days.</p>
      <p>If you have any questions, please contact us.</p>
    `;

    // Determine which edge function to use
    const sendFunction = mailbox.provider === 'gmail' ? 'gmail-send' : 'outlook-send';

    const { data, error } = await supabase.functions.invoke(sendFunction, {
      body: {
        mailboxId: mailbox.id,
        to: recipientEmail,
        subject,
        body,
      },
    });

    if (error) {
      console.error(`Failed to send via ${sendFunction}:`, error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error sending approval email via mailbox:", err);
    return false;
  }
}

export async function approveFilingByClient(
  filingId: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: filing } = await supabase
      .from("filings")
      .select("organization_id, status")
      .eq("id", filingId)
      .single();

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

    // Log audit
    if (filing) {
      await logAudit({
        organizationId: filing.organization_id,
        entityType: "filing",
        entityId: filingId,
        action: "client_approve",
        fieldName: "status",
        oldValue: filing.status,
        newValue: "ready_to_file",
        metadata: { approved_by: approvedBy },
      });
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
    const { data: filing } = await supabase
      .from("filings")
      .select("organization_id, status")
      .eq("id", filingId)
      .single();

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

    // Log audit
    if (filing) {
      await logAudit({
        organizationId: filing.organization_id,
        entityType: "filing",
        entityId: filingId,
        action: "client_reject",
        fieldName: "status",
        oldValue: filing.status,
        newValue: "rejected",
        metadata: { rejection_reason: rejectionReason },
      });
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
): Promise<{ success: boolean; error?: string; nextYearJobId?: string }> {
  try {
    // Get filing to check organization_id, current status, and rollover data
    const { data: filing, error: fetchError } = await supabase
      .from("filings")
      .select(`
        *,
        jobs(id, job_name, service_type, client_id, company_id, organization_id, period_start, period_end, assigned_to)
      `)
      .eq("id", filingId)
      .single();

    if (fetchError || !filing) {
      return { success: false, error: "Filing not found" };
    }

    // Check permission
    const canFile = await checkCanFinalise(filing.organization_id);
    if (!canFile) {
      return { success: false, error: "You don't have permission to mark filings as filed" };
    }

    // Idempotent check - if already filed and has next_year_job_id, skip rollover
    if (filing.status === "filed" && filing.next_year_job_id) {
      return { success: true, nextYearJobId: filing.next_year_job_id };
    }

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

    // Log audit
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: filingId,
      action: "file",
      fieldName: "status",
      oldValue: filing.status,
      newValue: "filed",
      metadata: { filing_reference: filingReference, filed_by: filedBy },
    });

    // Execute auto-rollover (idempotent)
    let nextYearJobId: string | undefined;
    if (filing.jobs) {
      const job = filing.jobs as any;
      const rolloverResult = await executeAutoRollover({
        filingId,
        jobId: job.id,
        serviceType: job.service_type,
        clientId: job.client_id,
        companyId: job.company_id,
        organizationId: job.organization_id,
        periodStart: job.period_start,
        periodEnd: job.period_end,
        taxYear: filing.tax_year,
        assignedTo: job.assigned_to,
      });

      if (rolloverResult.success && rolloverResult.nextYearJobId) {
        nextYearJobId = rolloverResult.nextYearJobId;
        
        // Update filing with next year job reference
        await supabase
          .from("filings")
          .update({ next_year_job_id: nextYearJobId })
          .eq("id", filingId);
      }
    }

    return { success: true, nextYearJobId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Document generation - calls actual edge function
export function getDocumentTypesForFiling(filingType: string): string[] {
  switch (filingType) {
    case "self_assessment":
    case "SA100":
      return ["SA Summary", "Tax Computation"];
    case "ct600":
    case "corporation_tax":
      return ["CT600 Summary", "Tax Computation", "Full Accounts PDF"];
    case "vat_return":
      return ["VAT Summary"];
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
  try {
    const documentTypes = getDocumentTypesForFiling(filingType);
    const generatedDocuments: FilingDocument[] = [];

    // Call edge function to generate PDFs
    for (const docType of documentTypes) {
      const outputType = docType.toLowerCase().replace(/ /g, '_');
      
      const { data, error } = await supabase.functions.invoke('generate-filing-pdf', {
        body: {
          filing_id: filingId,
          output_type: outputType,
        },
      });

      if (error) {
        console.error(`Failed to generate ${docType}:`, error);
        continue;
      }

      if (data?.document) {
        generatedDocuments.push(data.document);
      }
    }

    // Fetch updated documents from filing_documents table
    const { data: storedDocs } = await supabase
      .from("filing_documents")
      .select("*")
      .eq("filing_id", filingId);

    const documents: FilingDocument[] = (storedDocs || []).map(doc => ({
      id: doc.id,
      name: doc.document_name,
      type: doc.document_type,
      url: doc.storage_path,
      generated_at: doc.generated_at,
    }));

    // Update filing with generated documents reference
    await supabase
      .from("filings")
      .update({
        generated_documents: JSON.parse(JSON.stringify(documents)),
      })
      .eq("id", filingId);

    return { success: true, documents };
  } catch (err: any) {
    console.error("Error generating filing documents:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Submit filing to authority via API provider abstraction
 */
export async function submitFilingToAuthority(
  filingId: string
): Promise<{ success: boolean; submissionId?: string; filingReference?: string; error?: string }> {
  try {
    // Get filing details
    const { data: filing, error: fetchError } = await supabase
      .from("filings")
      .select("*")
      .eq("id", filingId)
      .single();

    if (fetchError || !filing) {
      return { success: false, error: "Filing not found" };
    }

    // Import and use the filing API provider
    const { getFilingProvider } = await import("@/lib/filing-api-provider");
    const provider = getFilingProvider(filing.filing_body);

    if (!provider) {
      return { success: false, error: `No provider available for ${filing.filing_body}` };
    }

    // Build submission payload from filing_data
    const submissionPayload = {
      filingId: filing.id,
      filingType: filing.filing_type,
      filingBody: filing.filing_body,
      taxYear: filing.tax_year,
      periodStart: filing.period_start,
      periodEnd: filing.period_end,
      filingData: filing.filing_data as Record<string, any>,
      clientId: filing.client_id || undefined,
      companyId: filing.company_id || undefined,
      organizationId: filing.organization_id,
    };

    // Emit submission event
    await emitFilingSubmittedEvent(
      filingId,
      filing.filing_type,
      filing.organization_id,
      { provider: filing.filing_body }
    );

    // Submit via provider
    const result = await provider.submitFiling(submissionPayload);

    // Update filing with submission result - cast to any for JSON compatibility
    await supabase
      .from("filings")
      .update({
        submission_payload: submissionPayload as any,
        api_response: { 
          success: result.success, 
          submissionId: result.submissionId, 
          status: result.status,
          message: result.message 
        } as any,
        api_submission_id: result.submissionId,
      })
      .eq("id", filingId);

    // Emit accepted/rejected event based on result
    if (result.success) {
      await emitFilingAcceptedEvent(
        filingId,
        filing.filing_type,
        filing.organization_id,
        result.filingReference
      );
    } else {
      await emitFilingRejectedEvent(
        filingId,
        filing.filing_type,
        filing.organization_id,
        result.message
      );
    }

    // Log audit
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: filingId,
      action: "api_submit",
      metadata: { provider: filing.filing_body, submission_id: result.submissionId },
    });

    return { 
      success: result.success, 
      submissionId: result.submissionId,
      filingReference: result.filingReference,
      error: result.message,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Submit RTI/CIS filing directly without client approval
 * Per CTO directive: No client approval for payroll filings
 * Workflow: draft → ready_to_file → filed (skip awaiting_approval)
 */
export async function submitPayrollFiling(
  filingId: string,
  userId: string
): Promise<{ success: boolean; filingReference?: string; nextYearJobId?: string; error?: string }> {
  try {
    // Get filing
    const { data: filing, error: fetchError } = await supabase
      .from("filings")
      .select("*")
      .eq("id", filingId)
      .single();

    if (fetchError || !filing) {
      return { success: false, error: "Filing not found" };
    }

    // Verify it's a payroll filing type
    if (!isPayrollFilingType(filing.filing_type)) {
      return { success: false, error: "Not a payroll filing type. Use standard approval workflow." };
    }

    // Check permission
    const canFile = await checkCanFinalise(filing.organization_id);
    if (!canFile) {
      return { success: false, error: "You don't have permission to submit filings" };
    }

    // Skip client approval - go directly to ready_to_file
    await updateFilingStatus(filingId, "ready_to_file");

    // Submit to authority via provider
    const submissionResult = await submitFilingToAuthority(filingId);

    if (!submissionResult.success) {
      // Revert to draft on failure
      await updateFilingStatus(filingId, "draft");
      return { success: false, error: submissionResult.error };
    }

    // Mark as filed
    const filedResult = await markFilingAsFiled(filingId, userId, submissionResult.filingReference);

    if (!filedResult.success) {
      return { success: false, error: filedResult.error };
    }

    return { 
      success: true, 
      filingReference: submissionResult.filingReference,
      nextYearJobId: filedResult.nextYearJobId,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if a filing type requires client approval
 * RTI and CIS filings do NOT require client approval per CTO directive
 */
export function filingRequiresClientApproval(filingType: string): boolean {
  return !isPayrollFilingType(filingType);
}

/**
 * Create RTI filing from pay run data
 * Per CTO: Creates filing with status "draft", NOT "filed"
 */
export async function createRTIFilingFromPayRun(
  payRunId: string,
  filingType: 'RTI_FPS' | 'RTI_EPS'
): Promise<{ success: boolean; filingId?: string; error?: string }> {
  try {
    // Fetch pay run with PAYE scheme and payslips
    const { data: payRun, error: payRunError } = await supabase
      .from("pay_runs")
      .select(`
        *,
        paye_schemes (
          id,
          name,
          employer_paye_reference,
          accounts_office_reference,
          company_id,
          client_id,
          organization_id
        )
      `)
      .eq("id", payRunId)
      .single();

    if (payRunError || !payRun) {
      return { success: false, error: "Pay run not found" };
    }

    const payeScheme = payRun.paye_schemes as any;
    const organizationId = payeScheme?.organization_id || payRun.organization_id;
    const entityId = payeScheme?.company_id || payeScheme?.client_id;
    const entityType = payeScheme?.company_id ? 'company' : 'client';

    // Fetch employees with payslips for FPS
    let employees: any[] = [];
    if (filingType === 'RTI_FPS') {
      const { data: payslips } = await supabase
        .from("payslips")
        .select(`
          *,
          employees (
            id,
            first_name,
            last_name,
            national_insurance_number,
            date_of_birth,
            tax_code,
            nic_category,
            is_director,
            director_nic_method,
            address_line_1,
            address_line_2,
            postcode
          )
        `)
        .eq("pay_run_id", payRunId);

      employees = (payslips || []).map(p => ({
        employeeId: p.employee_id,
        niNumber: p.employees?.national_insurance_number || '',
        firstName: p.employees?.first_name || '',
        lastName: p.employees?.last_name || '',
        dateOfBirth: p.employees?.date_of_birth || '',
        gender: 'M', // Default, should be from employee record
        address: {
          line1: p.employees?.address_line_1 || '',
          line2: p.employees?.address_line_2 || '',
          postcode: p.employees?.postcode || '',
        },
        taxCode: p.employees?.tax_code || '1257L',
        nicCategory: p.employees?.nic_category || 'A',
        isDirector: p.employees?.is_director || false,
        directorNICMethod: p.employees?.director_nic_method,
        taxablePay: p.taxable_pay || 0,
        taxDeducted: p.paye_tax || 0,
        employeeNIC: p.employee_nic || 0,
        employerNIC: p.employer_nic || 0,
        studentLoanDeduction: p.student_loan || 0,
        postgraduateLoanDeduction: 0,
        pensionContributions: p.employee_pension || 0,
        ytdTaxablePay: p.taxable_pay || 0,
        ytdTaxDeducted: p.paye_tax || 0,
        ytdEmployeeNIC: p.employee_nic || 0,
        ytdEmployerNIC: p.employer_nic || 0,
        ytdStudentLoan: p.student_loan || 0,
      }));
    }

    // Calculate tax month from payment date
    const paymentDate = new Date(payRun.payment_date);
    const taxMonth = paymentDate.getMonth() >= 3 
      ? paymentDate.getMonth() - 2 
      : paymentDate.getMonth() + 10;

    // Create filing with status "draft"
    const { data: filing, error: insertError } = await supabase
      .from("filings")
      .insert({
        organization_id: organizationId,
        company_id: entityType === 'company' ? entityId : null,
        client_id: entityType === 'client' ? entityId : null,
        filing_type: filingType,
        filing_body: "HMRC",
        tax_year: payRun.tax_year,
        period_start: payRun.period_start,
        period_end: payRun.period_end,
        status: "draft",
        filing_data: {
          pay_run_id: payRunId,
          paye_reference: payeScheme?.employer_paye_reference,
          accounts_office_ref: payeScheme?.accounts_office_reference,
          payment_date: payRun.payment_date,
          pay_frequency: payRun.pay_frequency,
          tax_month: taxMonth,
          employee_count: payRun.employee_count,
          employees: employees,
          totals: {
            gross: payRun.total_gross_pay,
            paye: payRun.total_paye,
            employee_nic: payRun.total_employee_nic,
            employer_nic: payRun.total_employer_nic,
            student_loan: payRun.total_student_loan,
            pension: payRun.total_employee_pension || 0,
            net: payRun.total_net_pay,
          },
        },
      } as any)
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Log audit
    await logAudit({
      organizationId,
      entityType: "filing",
      entityId: filing.id,
      action: "create",
      metadata: { source: "pay_run", pay_run_id: payRunId, filing_type: filingType },
    });

    return { success: true, filingId: filing.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Create CIS filing from CIS return data
 * Per CTO: Creates filing with status "draft", NOT "filed"
 */
export async function createCISFilingFromReturn(
  cisReturnId: string
): Promise<{ success: boolean; filingId?: string; error?: string }> {
  try {
    // Fetch CIS return with contractor and payments
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
        ),
        cis_payments (
          id,
          gross_amount,
          materials_amount,
          labour_amount,
          deduction_amount,
          deduction_rate,
          payment_date,
          invoice_number,
          cis_subcontractors (
            id,
            first_name,
            last_name,
            business_name,
            trading_name,
            utr,
            national_insurance_number,
            verification_number,
            deduction_rate,
            is_partnership,
            company_registration_number
          )
        )
      `)
      .eq("id", cisReturnId)
      .single();

    if (fetchError || !cisReturn) {
      return { success: false, error: "CIS return not found" };
    }

    const contractor = cisReturn.cis_contractors as any;
    const organizationId = contractor?.organization_id || cisReturn.organization_id;
    const entityId = contractor?.company_id || contractor?.client_id;
    const entityType = contractor?.company_id ? 'company' : 'client';

    // Build subcontractors array
    const payments = (cisReturn.cis_payments || []) as any[];
    const subcontractorMap = new Map<string, any>();
    
    payments.forEach(p => {
      const sub = p.cis_subcontractors;
      if (sub && !subcontractorMap.has(sub.id)) {
        subcontractorMap.set(sub.id, {
          id: sub.id,
          verificationType: sub.company_registration_number ? 'company' : sub.is_partnership ? 'partnership' : 'individual',
          firstName: sub.first_name,
          lastName: sub.last_name,
          tradingName: sub.trading_name,
          businessName: sub.business_name,
          companyRegistrationNumber: sub.company_registration_number,
          utr: sub.utr,
          niNumber: sub.national_insurance_number,
          verificationNumber: sub.verification_number,
          deductionRate: sub.deduction_rate,
        });
      }
    });

    const subcontractors = Array.from(subcontractorMap.values());

    const cisPayments = payments.map(p => ({
      subcontractorId: p.cis_subcontractors?.id,
      paymentDate: p.payment_date,
      grossAmount: p.gross_amount,
      labourAmount: p.labour_amount,
      materialsAmount: p.materials_amount || 0,
      deductionAmount: p.deduction_amount,
      netAmount: p.gross_amount - p.deduction_amount,
      deductionRate: p.deduction_rate,
      invoiceNumber: p.invoice_number,
    }));

    // Create filing with status "draft"
    const { data: filing, error: insertError } = await supabase
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
        status: "draft",
        filing_data: {
          cis_return_id: cisReturnId,
          contractor_utr: contractor?.contractor_utr,
          contractor_name: contractor?.name,
          accounts_office_ref: contractor?.accounts_office_reference,
          tax_month: cisReturn.tax_month,
          due_date: cisReturn.due_date,
          nil_return: (cisReturn.total_payments_count || 0) === 0,
          employment_declaration: cisReturn.employment_status_declaration,
          verification_declaration: cisReturn.subcontractor_verification_declaration,
          subcontractors,
          payments: cisPayments,
          totals: {
            gross: cisReturn.total_gross_amount,
            deductions: cisReturn.total_deductions,
            materials: cisReturn.total_materials_amount,
            payments_count: cisReturn.total_payments_count,
          },
        },
      } as any)
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Log audit
    await logAudit({
      organizationId,
      entityType: "filing",
      entityId: filing.id,
      action: "create",
      metadata: { source: "cis_return", cis_return_id: cisReturnId },
    });

    return { success: true, filingId: filing.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

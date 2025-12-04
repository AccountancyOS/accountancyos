/**
 * Auto Job Rollover Service
 * Creates next year's job, deadlines, and questionnaire when a filing is marked as filed
 * Template-driven and idempotent
 */

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";

export interface RolloverResult {
  success: boolean;
  error?: string;
  nextYearJobId?: string;
  deadlinesCreated?: number;
  questionnaireCreated?: boolean;
}

export interface RolloverConfig {
  filingId: string;
  jobId: string;
  organizationId: string;
  clientId?: string;
  companyId?: string;
  serviceType: string;
  periodEnd: string;
  taxYear?: string;
}

/**
 * Execute auto rollover when a filing is marked as filed
 * Idempotent - checks for existing next-year job before creating
 */
export async function executeAutoRollover(config: RolloverConfig): Promise<RolloverResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Calculate next period
    const currentPeriodEnd = new Date(config.periodEnd);
    const nextPeriodStart = new Date(currentPeriodEnd);
    nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
    
    const nextPeriodEnd = new Date(nextPeriodStart);
    nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
    nextPeriodEnd.setDate(nextPeriodEnd.getDate() - 1);
    
    const nextTaxYear = calculateNextTaxYear(config.taxYear);
    
    // Check if next year job already exists (idempotency)
    const existingJob = await checkExistingNextYearJob(
      config.organizationId,
      config.clientId,
      config.companyId,
      config.serviceType,
      nextPeriodEnd.toISOString().split("T")[0]
    );
    
    if (existingJob) {
      console.log(`[Rollover] Next year job already exists: ${existingJob.id}`);
      
      // Update filing with link to existing job
      await supabase
        .from("filings")
        .update({ next_year_job_id: existingJob.id })
        .eq("id", config.filingId);
      
      return {
        success: true,
        nextYearJobId: existingJob.id,
        deadlinesCreated: 0,
        questionnaireCreated: false,
      };
    }
    
    // Fetch original job to get template info
    const { data: originalJob, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", config.jobId)
      .single();
    
    if (jobError || !originalJob) {
      return { success: false, error: "Original job not found" };
    }
    
    // Create next year's job
    const nextJobName = generateNextYearJobName(originalJob.job_name, config.taxYear, nextTaxYear);
    
    const { data: nextJob, error: createError } = await supabase
      .from("jobs")
      .insert({
        organization_id: config.organizationId,
        client_id: config.clientId,
        company_id: config.companyId,
        job_name: nextJobName,
        service_type: config.serviceType,
        status: "not_started",
        priority: originalJob.priority || "medium",
        period_start: nextPeriodStart.toISOString().split("T")[0],
        period_end: nextPeriodEnd.toISOString().split("T")[0],
        assigned_to: originalJob.assigned_to,
        template_id: originalJob.template_id,
        tags: originalJob.tags,
        is_auto_generated: true,
        source_job_id: config.jobId,
      })
      .select()
      .single();
    
    if (createError || !nextJob) {
      console.error("[Rollover] Failed to create next year job:", createError);
      return { success: false, error: createError?.message || "Failed to create job" };
    }
    
    // Update filing with next_year_job_id
    await supabase
      .from("filings")
      .update({ next_year_job_id: nextJob.id })
      .eq("id", config.filingId);
    
    // Create deadlines for next year
    const deadlinesCreated = await createNextYearDeadlines(
      config.organizationId,
      config.clientId,
      config.companyId,
      nextJob.id,
      config.serviceType,
      nextPeriodEnd.toISOString().split("T")[0]
    );
    
    // Create draft questionnaire instance (not sent)
    const questionnaireCreated = false;
    
    // Create internal notification
    await createRolloverNotification(
      config.organizationId,
      originalJob.assigned_to || user?.id,
      nextJob.id,
      nextJobName
    );
    
    // Log audit
    await logAudit({
      organizationId: config.organizationId,
      entityType: "filing",
      entityId: config.filingId,
      action: "create",
      metadata: {
        action_type: "auto_rollover",
        next_year_job_id: nextJob.id,
        deadlines_created: deadlinesCreated,
        questionnaire_created: questionnaireCreated,
      },
    });
    
    console.log(`[Rollover] Successfully created next year job ${nextJob.id} with ${deadlinesCreated} deadlines`);
    
    return {
      success: true,
      nextYearJobId: nextJob.id,
      deadlinesCreated,
      questionnaireCreated,
    };
  } catch (err: any) {
    console.error("[Rollover] Error:", err);
    return { success: false, error: err.message };
  }
}

async function checkExistingNextYearJob(
  organizationId: string,
  clientId?: string,
  companyId?: string,
  serviceType?: string,
  periodEnd?: string
): Promise<{ id: string } | null> {
  let query = supabase
    .from("jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("service_type", serviceType || "");
  
  if (periodEnd) {
    query = query.eq("period_end", periodEnd);
  }
  
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  if (companyId) {
    query = query.eq("company_id", companyId);
  }
  
  const { data } = await query.maybeSingle();
  return data;
}

function calculateNextTaxYear(currentTaxYear?: string): string {
  if (!currentTaxYear) {
    const now = new Date();
    const year = now.getFullYear();
    return `${year}/${String(year + 1).slice(-2)}`;
  }
  
  // Parse "2024/25" format
  const parts = currentTaxYear.split("/");
  if (parts.length === 2) {
    const startYear = parseInt(parts[0]) + 1;
    const endYear = startYear + 1;
    return `${startYear}/${String(endYear).slice(-2)}`;
  }
  
  // Parse "2024" format
  const year = parseInt(currentTaxYear) + 1;
  return `${year}/${String(year + 1).slice(-2)}`;
}

function generateNextYearJobName(currentName: string, currentYear?: string, nextYear?: string): string {
  if (!currentYear || !nextYear) {
    return currentName.replace(/\d{4}\/\d{2}/, nextYear || "").trim() || currentName;
  }
  
  // Replace year in job name
  let newName = currentName.replace(currentYear, nextYear);
  
  // If no year was found in name, append it
  if (newName === currentName) {
    newName = `${currentName} ${nextYear}`;
  }
  
  return newName;
}

async function createNextYearDeadlines(
  organizationId: string,
  clientId?: string,
  companyId?: string,
  jobId?: string,
  serviceType?: string,
  periodEnd?: string
): Promise<number> {
  try {
    const deadlinesToCreate: any[] = [];
    const periodEndDate = periodEnd ? new Date(periodEnd) : new Date();
    
    // Calculate deadlines based on service type
    if (serviceType === "self_assessment" || serviceType === "SA100") {
      // SA filing deadline: 31 January following tax year
      const filingYear = periodEndDate.getFullYear() + 1;
      deadlinesToCreate.push({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        job_id: jobId,
        name: "Self Assessment Filing Deadline",
        deadline_type: "statutory",
        filing_body: "HMRC",
        due_date: `${filingYear}-01-31`,
        period_end: periodEnd,
        status: "pending",
        service_code: serviceType,
      });
      
      // Payment deadline: same as filing
      deadlinesToCreate.push({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        job_id: jobId,
        name: "Self Assessment Payment Due",
        deadline_type: "payment",
        filing_body: "HMRC",
        due_date: `${filingYear}-01-31`,
        payment_date: `${filingYear}-01-31`,
        period_end: periodEnd,
        status: "pending",
        service_code: serviceType,
      });
    } else if (serviceType === "ct600" || serviceType === "corporation_tax") {
      // CT filing deadline: 12 months after period end
      const filingDeadline = new Date(periodEndDate);
      filingDeadline.setFullYear(filingDeadline.getFullYear() + 1);
      
      // CT payment deadline: 9 months + 1 day after period end
      const paymentDeadline = new Date(periodEndDate);
      paymentDeadline.setMonth(paymentDeadline.getMonth() + 9);
      paymentDeadline.setDate(paymentDeadline.getDate() + 1);
      
      deadlinesToCreate.push({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        job_id: jobId,
        name: "Corporation Tax Return Filing",
        deadline_type: "statutory",
        filing_body: "HMRC",
        due_date: filingDeadline.toISOString().split("T")[0],
        period_end: periodEnd,
        status: "pending",
        service_code: serviceType,
      });
      
      deadlinesToCreate.push({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        job_id: jobId,
        name: "Corporation Tax Payment Due",
        deadline_type: "payment",
        filing_body: "HMRC",
        due_date: paymentDeadline.toISOString().split("T")[0],
        payment_date: paymentDeadline.toISOString().split("T")[0],
        period_end: periodEnd,
        status: "pending",
        service_code: serviceType,
      });
    } else if (serviceType === "accounts" || serviceType === "company_accounts") {
      // Companies House accounts: 9 months after period end
      const chDeadline = new Date(periodEndDate);
      chDeadline.setMonth(chDeadline.getMonth() + 9);
      
      deadlinesToCreate.push({
        organization_id: organizationId,
        client_id: clientId,
        company_id: companyId,
        job_id: jobId,
        name: "Annual Accounts Filing",
        deadline_type: "statutory",
        filing_body: "COMPANIES_HOUSE",
        due_date: chDeadline.toISOString().split("T")[0],
        period_end: periodEnd,
        status: "pending",
        service_code: serviceType,
      });
    }
    
    if (deadlinesToCreate.length > 0) {
      const { error } = await supabase
        .from("deadlines")
        .insert(deadlinesToCreate);
      
      if (error) {
        console.error("[Rollover] Failed to create deadlines:", error);
        return 0;
      }
    }
    
    return deadlinesToCreate.length;
  } catch (err) {
    console.error("[Rollover] Error creating deadlines:", err);
    return 0;
  }
}

// Placeholder for future questionnaire creation
// Will be implemented when questionnaire_instances table schema is finalized

async function createRolloverNotification(
  organizationId: string,
  userId?: string,
  jobId?: string,
  jobName?: string
): Promise<void> {
  if (!userId) return;
  
  try {
    await supabase
      .from("notifications")
      .insert({
        organization_id: organizationId,
        user_id: userId,
        type: "job_rollover",
        title: "Next Year Job Created",
        message: `A new job "${jobName}" has been automatically created for the next period.`,
        entity_type: "job",
        entity_id: jobId,
        is_read: false,
      });
  } catch (err) {
    console.error("[Rollover] Failed to create notification:", err);
  }
}

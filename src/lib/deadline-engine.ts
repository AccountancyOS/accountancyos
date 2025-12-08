/**
 * Deadline Engine
 * Centralized deadline generation utilities for statutory and internal deadlines
 */

import { supabase } from "@/integrations/supabase/client";
import { generateJobFromTemplate, GenerateJobResult } from "./job-template-engine";
import { emitDeadlineApproaching } from "./automation-triggers";

export interface DeadlineGenerationResult {
  success: boolean;
  deadlineId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Generate CS01 (Confirmation Statement) deadline from company data
 * Idempotent - checks for existing deadline before creating
 */
export async function generateCS01DeadlineFromCompany(
  organizationId: string,
  companyId: string,
  confirmationStatementNextDue?: string,
  confirmationStatementMadeUpTo?: string
): Promise<DeadlineGenerationResult> {
  try {
    if (!confirmationStatementNextDue) {
      return { success: false, skipped: true, reason: "No confirmation_statement_next_due date available" };
    }

    const dueDate = new Date(confirmationStatementNextDue);

    // Check for existing CS01 deadline for this company with same due date
    const { data: existingDeadline } = await supabase
      .from("deadlines")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("company_id", companyId)
      .eq("service_code", "CS01")
      .eq("due_date", confirmationStatementNextDue)
      .maybeSingle();

    if (existingDeadline) {
      console.log(`[Deadline Engine] CS01 deadline already exists for company ${companyId}`);
      return { success: true, skipped: true, reason: "Deadline already exists", deadlineId: existingDeadline.id };
    }

    // Calculate warning date (30 days before due)
    const warningDate = new Date(dueDate);
    warningDate.setDate(warningDate.getDate() - 30);

    // Calculate active window start (90 days before due)
    const activeWindowStart = new Date(dueDate);
    activeWindowStart.setDate(activeWindowStart.getDate() - 90);

    const { data: deadline, error } = await supabase
      .from("deadlines")
      .insert({
        organization_id: organizationId,
        company_id: companyId,
        name: "Confirmation Statement (CS01)",
        deadline_type: "statutory",
        filing_body: "COMPANIES_HOUSE",
        service_code: "CS01",
        due_date: confirmationStatementNextDue,
        period_end: confirmationStatementMadeUpTo,
        warning_date: warningDate.toISOString().split("T")[0],
        active_window_start: activeWindowStart.toISOString().split("T")[0],
        status: "pending",
        risk_score: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[Deadline Engine] Failed to create CS01 deadline:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Deadline Engine] Created CS01 deadline ${deadline.id} for company ${companyId}`);
    return { success: true, deadlineId: deadline.id };
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating CS01 deadline:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Generate all statutory deadlines for a company based on its profile
 * Called during onboarding or CH sync
 */
export async function generateCompanyDeadlines(
  organizationId: string,
  companyId: string
): Promise<{ cs01?: DeadlineGenerationResult; accounts?: DeadlineGenerationResult }> {
  const results: { cs01?: DeadlineGenerationResult; accounts?: DeadlineGenerationResult } = {};

  try {
    // Fetch company details
    const { data: company, error } = await supabase
      .from("companies")
      .select("id, company_name, confirmation_statement_next_due, confirmation_statement_made_up_to, year_end_month, year_end_day")
      .eq("id", companyId)
      .single();

    if (error || !company) {
      console.error("[Deadline Engine] Company not found:", companyId);
      return results;
    }

    // Generate CS01 deadline
    if (company.confirmation_statement_next_due) {
      results.cs01 = await generateCS01DeadlineFromCompany(
        organizationId,
        companyId,
        company.confirmation_statement_next_due,
        company.confirmation_statement_made_up_to
      );
    }

    // TODO: Generate accounts deadline if year_end is set

    return results;
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating company deadlines:", err);
    return results;
  }
}

/**
 * Calculate next CS01 due date from current made-up-to date
 * CS01 is due 14 days after the next made-up-to date (which is 1 year from current)
 */
export function calculateNextCS01DueDate(currentMadeUpToDate: string): { nextDueDate: string; nextMadeUpTo: string } {
  const currentDate = new Date(currentMadeUpToDate);
  
  // Next made-up-to date is 1 year from current
  const nextMadeUpTo = new Date(currentDate);
  nextMadeUpTo.setFullYear(nextMadeUpTo.getFullYear() + 1);
  
  // Due date is 14 days after the next made-up-to date
  const nextDueDate = new Date(nextMadeUpTo);
  nextDueDate.setDate(nextDueDate.getDate() + 14);
  
  return {
    nextDueDate: nextDueDate.toISOString().split("T")[0],
    nextMadeUpTo: nextMadeUpTo.toISOString().split("T")[0],
  };
}

/**
 * Update risk score for a deadline based on days remaining and other factors
 */
export async function updateDeadlineRiskScore(deadlineId: string): Promise<void> {
  try {
    const { data: deadline, error } = await supabase
      .from("deadlines")
      .select("id, due_date, status, job_id, jobs(status)")
      .eq("id", deadlineId)
      .single();

    if (error || !deadline) return;

    const dueDate = new Date(deadline.due_date);
    const now = new Date();
    const daysRemaining = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let riskScore = 0;

    // Days remaining factor
    if (daysRemaining < 0) {
      riskScore = 100; // Overdue
    } else if (daysRemaining <= 7) {
      riskScore = 80;
    } else if (daysRemaining <= 14) {
      riskScore = 60;
    } else if (daysRemaining <= 30) {
      riskScore = 40;
    } else if (daysRemaining <= 60) {
      riskScore = 20;
    }

    // Job status factor
    if (deadline.jobs) {
      const jobStatus = (deadline.jobs as any).status;
      if (jobStatus === "not_started" && daysRemaining < 30) {
        riskScore = Math.min(100, riskScore + 20);
      }
    } else if (daysRemaining < 30) {
      // No job linked and deadline is approaching
      riskScore = Math.min(100, riskScore + 10);
    }

    await supabase
      .from("deadlines")
      .update({ risk_score: riskScore })
      .eq("id", deadlineId);
  } catch (err) {
    console.error("[Deadline Engine] Error updating risk score:", err);
  }
}

// ==================== RTI DEADLINES ====================

/**
 * Generate RTI deadlines for a PAYE scheme
 * FPS due on/before payday, EPS due by 19th of following month
 */
export async function generateRTIDeadlines(
  organizationId: string,
  payeSchemeId: string,
  companyId: string,
  payFrequency: string,
  taxYear: string
): Promise<DeadlineGenerationResult[]> {
  const results: DeadlineGenerationResult[] = [];
  
  try {
    // Parse tax year (e.g., "2024/25")
    const [startYear] = taxYear.split("/").map(Number);
    const taxYearStart = new Date(startYear, 3, 6); // April 6th
    const taxYearEnd = new Date(startYear + 1, 3, 5); // April 5th
    
    // Generate EPS deadlines for each month (due 19th of following month)
    for (let month = 0; month < 12; month++) {
      const periodMonth = new Date(taxYearStart);
      periodMonth.setMonth(periodMonth.getMonth() + month);
      
      const epsDeadline = new Date(periodMonth);
      epsDeadline.setMonth(epsDeadline.getMonth() + 1);
      epsDeadline.setDate(19);
      
      // Warning 7 days before
      const warningDate = new Date(epsDeadline);
      warningDate.setDate(warningDate.getDate() - 7);
      
      // Check for existing
      const { data: existing } = await supabase
        .from("deadlines")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("company_id", companyId)
        .eq("service_code", "RTI_EPS")
        .eq("due_date", epsDeadline.toISOString().split("T")[0])
        .maybeSingle();
      
      if (!existing) {
        const taxMonth = ((periodMonth.getMonth() - 3 + 12) % 12) + 1;
        
        const { data: deadline, error } = await supabase
          .from("deadlines")
          .insert({
            organization_id: organizationId,
            company_id: companyId,
            name: `EPS Month ${taxMonth} - ${taxYear}`,
            deadline_type: "statutory",
            filing_body: "HMRC",
            service_code: "RTI_EPS",
            due_date: epsDeadline.toISOString().split("T")[0],
            warning_date: warningDate.toISOString().split("T")[0],
            status: "pending",
            risk_score: 0,
          })
          .select()
          .single();
        
        if (error) {
          results.push({ success: false, error: error.message });
        } else {
          results.push({ success: true, deadlineId: deadline.id });
        }
      } else {
        results.push({ success: true, skipped: true, reason: "Deadline already exists", deadlineId: existing.id });
      }
    }
    
    // Generate P60 deadline (31 May following tax year)
    const p60Deadline = new Date(startYear + 1, 4, 31); // May 31st
    const { data: existingP60 } = await supabase
      .from("deadlines")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("company_id", companyId)
      .eq("service_code", "RTI_P60")
      .eq("due_date", p60Deadline.toISOString().split("T")[0])
      .maybeSingle();
    
    if (!existingP60) {
      const { data: p60, error: p60Error } = await supabase
        .from("deadlines")
        .insert({
          organization_id: organizationId,
          company_id: companyId,
          name: `P60 Distribution - ${taxYear}`,
          deadline_type: "statutory",
          filing_body: "HMRC",
          service_code: "RTI_P60",
          due_date: p60Deadline.toISOString().split("T")[0],
          warning_date: new Date(startYear + 1, 4, 24).toISOString().split("T")[0],
          status: "pending",
          risk_score: 0,
        })
        .select()
        .single();
      
      results.push(p60Error ? { success: false, error: p60Error.message } : { success: true, deadlineId: p60.id });
    }
    
    return results;
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating RTI deadlines:", err);
    return [{ success: false, error: err.message }];
  }
}

// ==================== CIS DEADLINES ====================

/**
 * Generate CIS deadlines for a contractor
 * CIS returns due by 19th of each month
 */
export async function generateCISDeadlines(
  organizationId: string,
  contractorId: string,
  companyId: string | null,
  clientId: string | null,
  taxYear: string
): Promise<DeadlineGenerationResult[]> {
  const results: DeadlineGenerationResult[] = [];
  
  try {
    const [startYear] = taxYear.split("/").map(Number);
    const taxYearStart = new Date(startYear, 3, 6); // April 6th
    
    // Generate monthly CIS return deadlines (due 19th of following month)
    for (let month = 0; month < 12; month++) {
      const periodMonth = new Date(taxYearStart);
      periodMonth.setMonth(periodMonth.getMonth() + month);
      
      const cisDeadline = new Date(periodMonth);
      cisDeadline.setMonth(cisDeadline.getMonth() + 1);
      cisDeadline.setDate(19);
      
      const warningDate = new Date(cisDeadline);
      warningDate.setDate(warningDate.getDate() - 7);
      
      // Period end is 5th of the month
      const periodEnd = new Date(cisDeadline.getFullYear(), cisDeadline.getMonth(), 5);
      
      const taxMonth = ((periodMonth.getMonth() - 3 + 12) % 12) + 1;
      
      // Check for existing
      const { data: existing } = await supabase
        .from("deadlines")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("service_code", "CIS_RETURN")
        .eq("due_date", cisDeadline.toISOString().split("T")[0])
        .maybeSingle();
      
      if (!existing) {
        const { data: deadline, error } = await supabase
          .from("deadlines")
          .insert({
            organization_id: organizationId,
            company_id: companyId,
            client_id: clientId,
            name: `CIS Return Month ${taxMonth} - ${taxYear}`,
            deadline_type: "statutory",
            filing_body: "HMRC",
            service_code: "CIS_RETURN",
            due_date: cisDeadline.toISOString().split("T")[0],
            period_end: periodEnd.toISOString().split("T")[0],
            warning_date: warningDate.toISOString().split("T")[0],
            status: "pending",
            risk_score: 0,
          })
          .select()
          .single();
        
        if (error) {
          results.push({ success: false, error: error.message });
        } else {
          results.push({ success: true, deadlineId: deadline.id });
        }
      } else {
        results.push({ success: true, skipped: true, reason: "Deadline already exists", deadlineId: existing.id });
      }
    }
    
    return results;
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating CIS deadlines:", err);
    return [{ success: false, error: err.message }];
  }
}

// ==================== VAT DEADLINES ====================

/**
 * Generate VAT return deadlines based on company VAT configuration
 */
export async function generateVATDeadlines(
  organizationId: string,
  companyId: string,
  vatFrequency: string,
  vatStaggerGroup: number | null,
  periodStart: Date
): Promise<DeadlineGenerationResult[]> {
  const results: DeadlineGenerationResult[] = [];
  
  try {
    let quarterEndMonths: number[] = [];
    
    if (vatFrequency === 'QUARTERLY' && vatStaggerGroup) {
      // Stagger groups: 1 = Jan/Apr/Jul/Oct, 2 = Feb/May/Aug/Nov, 3 = Mar/Jun/Sep/Dec
      switch (vatStaggerGroup) {
        case 1: quarterEndMonths = [0, 3, 6, 9]; break; // Jan, Apr, Jul, Oct
        case 2: quarterEndMonths = [1, 4, 7, 10]; break; // Feb, May, Aug, Nov
        case 3: quarterEndMonths = [2, 5, 8, 11]; break; // Mar, Jun, Sep, Dec
      }
    } else if (vatFrequency === 'MONTHLY') {
      quarterEndMonths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    } else if (vatFrequency === 'ANNUAL') {
      // Annual based on year end
      quarterEndMonths = [periodStart.getMonth()];
    }
    
    // Generate for next 4 periods
    for (let i = 0; i < Math.min(4, quarterEndMonths.length); i++) {
      const periodEnd = new Date(periodStart.getFullYear(), quarterEndMonths[i] + 1, 0); // Last day of month
      
      // VAT deadline: period end + 1 month + 7 days
      const vatDeadline = new Date(periodEnd);
      vatDeadline.setMonth(vatDeadline.getMonth() + 1);
      vatDeadline.setDate(vatDeadline.getDate() + 7);
      
      const warningDate = new Date(vatDeadline);
      warningDate.setDate(warningDate.getDate() - 14);
      
      const { data: existing } = await supabase
        .from("deadlines")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("company_id", companyId)
        .eq("service_code", "VAT_RETURN")
        .eq("period_end", periodEnd.toISOString().split("T")[0])
        .maybeSingle();
      
      if (!existing) {
        const { data: deadline, error } = await supabase
          .from("deadlines")
          .insert({
            organization_id: organizationId,
            company_id: companyId,
            name: `VAT Return Q${i + 1}`,
            deadline_type: "statutory",
            filing_body: "HMRC",
            service_code: "VAT_RETURN",
            due_date: vatDeadline.toISOString().split("T")[0],
            payment_date: vatDeadline.toISOString().split("T")[0],
            period_end: periodEnd.toISOString().split("T")[0],
            warning_date: warningDate.toISOString().split("T")[0],
            status: "pending",
            risk_score: 0,
          })
          .select()
          .single();
        
        results.push(error ? { success: false, error: error.message } : { success: true, deadlineId: deadline.id });
      }
    }
    
    return results;
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating VAT deadlines:", err);
    return [{ success: false, error: err.message }];
  }
}

// ==================== DEADLINE APPROACHING DETECTION ====================

/**
 * Check deadlines and emit events for those entering warning window.
 * Called by scheduled job or when deadlines are updated.
 */
export async function checkAndEmitDeadlineApproachingEvents(
  organizationId: string
): Promise<{ emitted: number; errors: string[] }> {
  const result = { emitted: 0, errors: [] as string[] };
  
  try {
    const today = new Date();
    const warningWindowDays = 14; // Default warning window
    
    // Find deadlines entering warning window (due within warningWindowDays, not completed)
    const { data: deadlines, error } = await supabase
      .from("deadlines")
      .select("id, organization_id, name, due_date, status, warning_date")
      .eq("organization_id", organizationId)
      .in("status", ["pending", "active"])
      .lte("warning_date", today.toISOString().split("T")[0])
      .gte("due_date", today.toISOString().split("T")[0]);
    
    if (error) {
      result.errors.push(error.message);
      return result;
    }
    
    for (const deadline of deadlines || []) {
      const dueDate = new Date(deadline.due_date);
      const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const eventId = await emitDeadlineApproaching(
        deadline.organization_id,
        deadline.id,
        deadline.due_date,
        daysRemaining,
        { deadlineName: deadline.name }
      );
      
      if (eventId) {
        result.emitted++;
      } else {
        result.errors.push(`Failed to emit event for deadline ${deadline.id}`);
      }
    }
    
    return result;
  } catch (err: any) {
    result.errors.push(err.message);
    return result;
  }
}

// ==================== DEADLINE → JOB GENERATION ====================

/**
 * Generate jobs from templates when a deadline enters its active window
 * Called when deadline status transitions or on scheduled check
 */
export async function generateJobsForDeadline(
  deadlineId: string
): Promise<GenerateJobResult[]> {
  const results: GenerateJobResult[] = [];

  try {
    // 1. Fetch deadline details
    const { data: deadline, error: deadlineError } = await supabase
      .from("deadlines")
      .select("*")
      .eq("id", deadlineId)
      .single();

    if (deadlineError || !deadline) {
      return [{ success: false, error: "Deadline not found" }];
    }

    // 2. Determine entity from deadline
    const entity: { type: "company" | "client"; id: string } | null = 
      deadline.company_id 
        ? { type: "company", id: deadline.company_id }
        : deadline.client_id 
        ? { type: "client", id: deadline.client_id }
        : null;

    if (!entity) {
      return [{ success: false, error: "Deadline has no linked entity" }];
    }

    // 3. Find templates with trigger_type = 'deadline_approaching' or 'deadline_based'
    const { data: templates, error: templatesError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("organization_id", deadline.organization_id)
      .eq("is_active", true)
      .in("trigger_type", ["deadline_approaching", "deadline_based"]);

    if (templatesError || !templates || templates.length === 0) {
      return [{ success: true, skipped: true, skipReason: "No deadline-based templates found" }];
    }

    // 4. Filter templates by service_code match
    const matchingTemplates = templates.filter(
      (t) => t.service_type === deadline.service_code || !t.service_type
    );

    // 5. Generate jobs from matching templates
    for (const template of matchingTemplates) {
      const result = await generateJobFromTemplate(
        template.id,
        deadline.organization_id,
        entity,
        {
          periodStart: deadline.period_start ? new Date(deadline.period_start) : undefined,
          periodEnd: deadline.period_end ? new Date(deadline.period_end) : undefined,
          filingDeadline: new Date(deadline.due_date),
          generationReason: `Deadline-based: ${deadline.name}`,
        }
      );

      // Link job to deadline if created successfully
      if (result.success && result.jobId && !result.skipped) {
        await supabase
          .from("deadlines")
          .update({ job_id: result.jobId })
          .eq("id", deadlineId);
      }

      results.push(result);
    }

    return results;
  } catch (err: any) {
    console.error("[Deadline Engine] Error generating jobs for deadline:", err);
    return [{ success: false, error: err.message }];
  }
}

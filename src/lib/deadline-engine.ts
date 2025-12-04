/**
 * Deadline Engine
 * Centralized deadline generation utilities for statutory and internal deadlines
 */

import { supabase } from "@/integrations/supabase/client";

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

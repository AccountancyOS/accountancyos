import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./audit-service";
import { addDays, addMonths, startOfMonth, endOfMonth, format } from "date-fns";

// =====================================================
// Types
// =====================================================

export interface ExceptionHandlerResult {
  success: boolean;
  error?: string;
  changes: {
    jobsUpdated: number;
    jobsClosed: number;
    jobsCreated: number;
    deadlinesUpdated: number;
  };
  auditEntries: string[];
}

interface JobChange {
  jobId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

// =====================================================
// VAT Stagger Change Handler
// =====================================================

/**
 * Handles VAT stagger group change for a company
 * - Updates future VAT job dates
 * - Backfills missing quarter jobs
 * - Closes incorrectly generated jobs
 * 
 * IDEMPOTENT: Safe to run multiple times
 */
export async function handleVATStaggerChange(
  companyId: string,
  organizationId: string,
  newStagger: number,
  oldStagger?: number
): Promise<ExceptionHandlerResult> {
  const result: ExceptionHandlerResult = {
    success: true,
    changes: { jobsUpdated: 0, jobsClosed: 0, jobsCreated: 0, deadlinesUpdated: 0 },
    auditEntries: [],
  };

  try {
    // 1. Get all future VAT jobs for this company
    const { data: futureJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("company_id", companyId)
      .eq("organization_id", organizationId)
      .eq("service_type", "VAT")
      .in("status", ["not_started", "in_progress"])
      .gte("period_end", new Date().toISOString().split("T")[0]);

    if (jobsError) {
      return { ...result, success: false, error: jobsError.message };
    }

    // 2. Calculate correct quarter end dates for new stagger
    const correctQuarterEnds = calculateVATQuarterEnds(newStagger);
    const incorrectQuarterEnds = oldStagger ? calculateVATQuarterEnds(oldStagger) : [];

    // 3. Process each job
    for (const job of futureJobs || []) {
      const jobPeriodEnd = job.period_end ? new Date(job.period_end) : null;
      if (!jobPeriodEnd) continue;

      // Check if this job's period matches new stagger
      const matchesNewStagger = correctQuarterEnds.some(
        (date) => format(date, "yyyy-MM-dd") === format(jobPeriodEnd, "yyyy-MM-dd")
      );

      // Check if this job's period matches old stagger (should be closed)
      const matchesOldStagger = incorrectQuarterEnds.some(
        (date) => format(date, "yyyy-MM-dd") === format(jobPeriodEnd, "yyyy-MM-dd")
      );

      if (matchesOldStagger && !matchesNewStagger && job.status === "not_started") {
        // Close this job - it's for wrong stagger group
        await closeJobWithReason(
          job.id,
          organizationId,
          `VAT stagger changed from ${oldStagger} to ${newStagger}`,
          result
        );
        result.changes.jobsClosed++;
      } else if (!matchesNewStagger && !matchesOldStagger) {
        // Update the period dates to match new stagger
        const newDates = findClosestQuarterDates(jobPeriodEnd, correctQuarterEnds);
        if (newDates) {
          await updateJobDates(job, newDates, organizationId, result);
          result.changes.jobsUpdated++;
        }
      }
    }

    // 4. Backfill missing quarter jobs (check next 4 quarters)
    for (const quarterEnd of correctQuarterEnds) {
      const quarterStart = startOfMonth(addMonths(quarterEnd, -2));
      
      // Check if job exists for this quarter
      const { data: existingJob } = await supabase
        .from("jobs")
        .select("id")
        .eq("company_id", companyId)
        .eq("organization_id", organizationId)
        .eq("service_type", "VAT")
        .eq("period_end", format(quarterEnd, "yyyy-MM-dd"))
        .maybeSingle();

      if (!existingJob) {
        // Create job for this quarter
        const { data: vatTemplate } = await supabase
          .from("job_templates")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("service_type", "VAT")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (vatTemplate) {
          const { generateJobFromTemplate } = await import("./job-template-engine");
          await generateJobFromTemplate(
            vatTemplate.id,
            organizationId,
            { type: "company", id: companyId },
            {
              periodStart: quarterStart,
              periodEnd: quarterEnd,
              generationReason: `Backfilled due to VAT stagger change to ${newStagger}`,
            }
          );
          result.changes.jobsCreated++;
        }
      }
    }

    // 5. Update related deadlines
    const deadlinesUpdated = await updateVATDeadlines(companyId, organizationId, newStagger);
    result.changes.deadlinesUpdated = deadlinesUpdated;

    return result;
  } catch (error) {
    return { ...result, success: false, error: (error as Error).message };
  }
}

// =====================================================
// Year-End Change Handler
// =====================================================

/**
 * Handles year-end change for a company
 * - Regenerates CT deadlines
 * - Updates accounting period metadata on future jobs
 * - Removes/postpones existing future jobs if dates conflict
 * 
 * IDEMPOTENT: Safe to run multiple times
 */
export async function handleYearEndChange(
  companyId: string,
  organizationId: string,
  newYearEnd: { month: number; day: number },
  oldYearEnd?: { month: number; day: number }
): Promise<ExceptionHandlerResult> {
  const result: ExceptionHandlerResult = {
    success: true,
    changes: { jobsUpdated: 0, jobsClosed: 0, jobsCreated: 0, deadlinesUpdated: 0 },
    auditEntries: [],
  };

  try {
    // 1. Get all future Accounts/CT jobs
    const { data: futureJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("company_id", companyId)
      .eq("organization_id", organizationId)
      .in("service_type", ["ACCOUNTS", "CT", "CT600"])
      .in("status", ["not_started", "in_progress"])
      .gte("period_end", new Date().toISOString().split("T")[0]);

    if (jobsError) {
      return { ...result, success: false, error: jobsError.message };
    }

    // 2. Calculate new year-end dates
    const today = new Date();
    const currentYear = today.getFullYear();
    const newYearEndDates = [
      new Date(currentYear, newYearEnd.month - 1, newYearEnd.day),
      new Date(currentYear + 1, newYearEnd.month - 1, newYearEnd.day),
    ];

    // 3. Process each job
    for (const job of futureJobs || []) {
      const jobPeriodEnd = job.period_end ? new Date(job.period_end) : null;
      if (!jobPeriodEnd) continue;

      // Check if job matches old year-end (should be updated)
      if (oldYearEnd) {
        const matchesOldYearEnd = 
          jobPeriodEnd.getMonth() === oldYearEnd.month - 1 &&
          jobPeriodEnd.getDate() === oldYearEnd.day;

        if (matchesOldYearEnd) {
          // Update to new year-end
          const newPeriodEnd = new Date(
            jobPeriodEnd.getFullYear(),
            newYearEnd.month - 1,
            newYearEnd.day
          );
          const newPeriodStart = addMonths(newPeriodEnd, -12);
          newPeriodStart.setDate(newPeriodStart.getDate() + 1);

          // Calculate new filing deadline (9 months for accounts, 12 months for CT)
          const deadlineMonths = job.service_type === "ACCOUNTS" ? 9 : 12;
          const newDeadline = addMonths(newPeriodEnd, deadlineMonths);

          await updateJobDates(
            job,
            { 
              periodStart: newPeriodStart, 
              periodEnd: newPeriodEnd, 
              filingDeadline: newDeadline 
            },
            organizationId,
            result
          );
          result.changes.jobsUpdated++;
        }
      }
    }

    // 4. Update related deadlines
    const { data: deadlines } = await supabase
      .from("deadlines")
      .select("*")
      .eq("company_id", companyId)
      .eq("organization_id", organizationId)
      .in("deadline_type", ["accounts_filing", "ct_filing", "ct_payment"])
      .eq("status", "pending");

    for (const deadline of deadlines || []) {
      const oldDueDate = deadline.due_date;
      // Recalculate based on new year-end
      const baseDate = new Date(
        new Date(oldDueDate).getFullYear(),
        newYearEnd.month - 1,
        newYearEnd.day
      );
      
      let newDueDate: Date;
      if (deadline.deadline_type === "accounts_filing") {
        newDueDate = addMonths(baseDate, 9);
      } else if (deadline.deadline_type === "ct_payment") {
        newDueDate = addDays(addMonths(baseDate, 9), 1);
      } else {
        newDueDate = addMonths(baseDate, 12);
      }

      if (format(newDueDate, "yyyy-MM-dd") !== oldDueDate) {
        await updateDeadlineWithAudit(
          deadline.id,
          organizationId,
          { due_date: format(newDueDate, "yyyy-MM-dd") },
          { due_date: oldDueDate },
          "Year-end change",
          result
        );
        result.changes.deadlinesUpdated++;
      }
    }

    return result;
  } catch (error) {
    return { ...result, success: false, error: (error as Error).message };
  }
}

// =====================================================
// Payroll Schedule Change Handler
// =====================================================

/**
 * Handles payroll schedule change
 * - Auto-creates correct future jobs
 * - Closes jobs that no longer apply
 * - Avoids duplicate jobs
 * 
 * IDEMPOTENT: Safe to run multiple times
 */
export async function handlePayrollScheduleChange(
  payeSchemeId: string,
  organizationId: string,
  newFrequency: "weekly" | "fortnightly" | "four_weekly" | "monthly",
  oldFrequency?: string
): Promise<ExceptionHandlerResult> {
  const result: ExceptionHandlerResult = {
    success: true,
    changes: { jobsUpdated: 0, jobsClosed: 0, jobsCreated: 0, deadlinesUpdated: 0 },
    auditEntries: [],
  };

  try {
    // 1. Get PAYE scheme details to find company
    const { data: scheme, error: schemeError } = await supabase
      .from("paye_schemes")
      .select("*, companies!inner(id, company_name)")
      .eq("id", payeSchemeId)
      .single();

    if (schemeError || !scheme) {
      return { ...result, success: false, error: "PAYE scheme not found" };
    }

    const companyId = scheme.company_id;

    // 2. Get all future payroll jobs
    const { data: futureJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("company_id", companyId)
      .eq("organization_id", organizationId)
      .eq("service_type", "PAYROLL")
      .in("status", ["not_started"])
      .gte("period_end", new Date().toISOString().split("T")[0]);

    if (jobsError) {
      return { ...result, success: false, error: jobsError.message };
    }

    // 3. Calculate expected periods for new frequency
    const expectedPeriods = calculatePayrollPeriods(newFrequency, 6); // Next 6 periods

    // 4. Close jobs that don't match new frequency
    for (const job of futureJobs || []) {
      const jobPeriodEnd = job.period_end;
      const matchesNewFrequency = expectedPeriods.some(
        (p) => format(p.end, "yyyy-MM-dd") === jobPeriodEnd
      );

      if (!matchesNewFrequency) {
        await closeJobWithReason(
          job.id,
          organizationId,
          `Payroll frequency changed from ${oldFrequency} to ${newFrequency}`,
          result
        );
        result.changes.jobsClosed++;
      }
    }

    // 5. Create missing jobs for new frequency
    const { data: payrollTemplate } = await supabase
      .from("job_templates")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("service_type", "PAYROLL")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (payrollTemplate) {
      for (const period of expectedPeriods) {
        // Check if job already exists
        const { data: existingJob } = await supabase
          .from("jobs")
          .select("id")
          .eq("company_id", companyId)
          .eq("organization_id", organizationId)
          .eq("service_type", "PAYROLL")
          .eq("period_end", format(period.end, "yyyy-MM-dd"))
          .not("status", "eq", "cancelled")
          .maybeSingle();

        if (!existingJob) {
          const { generateJobFromTemplate } = await import("./job-template-engine");
          await generateJobFromTemplate(
            payrollTemplate.id,
            organizationId,
            { type: "company", id: companyId },
            {
              periodStart: period.start,
              periodEnd: period.end,
              generationReason: `Created due to payroll frequency change to ${newFrequency}`,
            }
          );
          result.changes.jobsCreated++;
        }
      }
    }

    return result;
  } catch (error) {
    return { ...result, success: false, error: (error as Error).message };
  }
}

// =====================================================
// Helper Functions
// =====================================================

function calculateVATQuarterEnds(staggerGroup: number): Date[] {
  const today = new Date();
  const currentYear = today.getFullYear();
  const quarters: Date[] = [];

  // Stagger groups: 1 = Jan/Apr/Jul/Oct, 2 = Feb/May/Aug/Nov, 3 = Mar/Jun/Sep/Dec
  const monthOffsets: Record<number, number[]> = {
    1: [0, 3, 6, 9],   // Jan, Apr, Jul, Oct
    2: [1, 4, 7, 10],  // Feb, May, Aug, Nov
    3: [2, 5, 8, 11],  // Mar, Jun, Sep, Dec
  };

  const months = monthOffsets[staggerGroup] || monthOffsets[3];

  // Get next 4 quarter ends
  for (const month of months) {
    let date = endOfMonth(new Date(currentYear, month, 1));
    if (date < today) {
      date = endOfMonth(new Date(currentYear + 1, month, 1));
    }
    quarters.push(date);
  }

  // Sort and take next 4
  quarters.sort((a, b) => a.getTime() - b.getTime());
  return quarters.slice(0, 4);
}

function findClosestQuarterDates(
  currentEnd: Date,
  correctEnds: Date[]
): { periodStart: Date; periodEnd: Date; filingDeadline: Date } | null {
  // Find the closest correct quarter end
  let closest = correctEnds[0];
  let minDiff = Math.abs(currentEnd.getTime() - closest.getTime());

  for (const date of correctEnds) {
    const diff = Math.abs(currentEnd.getTime() - date.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = date;
    }
  }

  if (!closest) return null;

  return {
    periodStart: startOfMonth(addMonths(closest, -2)),
    periodEnd: closest,
    filingDeadline: addDays(addMonths(closest, 1), 7),
  };
}

function calculatePayrollPeriods(
  frequency: string,
  count: number
): { start: Date; end: Date }[] {
  const periods: { start: Date; end: Date }[] = [];
  let currentStart = startOfMonth(new Date());

  for (let i = 0; i < count; i++) {
    let end: Date;

    switch (frequency) {
      case "weekly":
        end = addDays(currentStart, 6);
        break;
      case "fortnightly":
        end = addDays(currentStart, 13);
        break;
      case "four_weekly":
        end = addDays(currentStart, 27);
        break;
      case "monthly":
      default:
        end = endOfMonth(currentStart);
        break;
    }

    periods.push({ start: currentStart, end });

    // Move to next period
    currentStart = addDays(end, 1);
  }

  return periods;
}

async function closeJobWithReason(
  jobId: string,
  organizationId: string,
  reason: string,
  result: ExceptionHandlerResult
): Promise<void> {
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  const oldStatus = job?.status;

  await supabase
    .from("jobs")
    .update({ 
      status: "cancelled",
      notes: reason,
    })
    .eq("id", jobId);

  await logAudit({
    organizationId,
    entityType: "job",
    entityId: jobId,
    action: "update",
    fieldName: "status",
    oldValue: oldStatus,
    newValue: "cancelled",
    metadata: { reason, source: "exception_handler" },
  });

  result.auditEntries.push(`Job ${jobId}: status ${oldStatus} → cancelled (${reason})`);
}

async function updateJobDates(
  job: any,
  newDates: { periodStart: Date; periodEnd: Date; filingDeadline: Date },
  organizationId: string,
  result: ExceptionHandlerResult
): Promise<void> {
  const oldPeriodStart = job.period_start;
  const oldPeriodEnd = job.period_end;
  const oldDeadline = job.filing_deadline;

  const newPeriodStart = format(newDates.periodStart, "yyyy-MM-dd");
  const newPeriodEnd = format(newDates.periodEnd, "yyyy-MM-dd");
  const newDeadline = format(newDates.filingDeadline, "yyyy-MM-dd");

  // Only update if dates actually changed
  if (
    oldPeriodStart === newPeriodStart &&
    oldPeriodEnd === newPeriodEnd &&
    oldDeadline === newDeadline
  ) {
    return;
  }

  await supabase
    .from("jobs")
    .update({
      period_start: newPeriodStart,
      period_end: newPeriodEnd,
      filing_deadline: newDeadline,
    })
    .eq("id", job.id);

  // Log each field change
  if (oldPeriodStart !== newPeriodStart) {
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: job.id,
      action: "update",
      fieldName: "period_start",
      oldValue: oldPeriodStart,
      newValue: newPeriodStart,
      metadata: { source: "exception_handler" },
    });
    result.auditEntries.push(`Job ${job.id}: period_start ${oldPeriodStart} → ${newPeriodStart}`);
  }

  if (oldPeriodEnd !== newPeriodEnd) {
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: job.id,
      action: "update",
      fieldName: "period_end",
      oldValue: oldPeriodEnd,
      newValue: newPeriodEnd,
      metadata: { source: "exception_handler" },
    });
    result.auditEntries.push(`Job ${job.id}: period_end ${oldPeriodEnd} → ${newPeriodEnd}`);
  }

  if (oldDeadline !== newDeadline) {
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: job.id,
      action: "update",
      fieldName: "filing_deadline",
      oldValue: oldDeadline,
      newValue: newDeadline,
      metadata: { source: "exception_handler" },
    });
    result.auditEntries.push(`Job ${job.id}: filing_deadline ${oldDeadline} → ${newDeadline}`);
  }
}

async function updateDeadlineWithAudit(
  deadlineId: string,
  organizationId: string,
  newValues: Record<string, any>,
  oldValues: Record<string, any>,
  reason: string,
  result: ExceptionHandlerResult
): Promise<void> {
  await supabase
    .from("deadlines")
    .update(newValues)
    .eq("id", deadlineId);

  for (const [field, newValue] of Object.entries(newValues)) {
    const oldValue = oldValues[field];
    if (oldValue !== newValue) {
      await logAudit({
        organizationId,
        entityType: "deadline",
        entityId: deadlineId,
        action: "update",
        fieldName: field,
        oldValue: String(oldValue),
        newValue: String(newValue),
        metadata: { reason, source: "exception_handler" },
      });
      result.auditEntries.push(`Deadline ${deadlineId}: ${field} ${oldValue} → ${newValue}`);
    }
  }
}

async function updateVATDeadlines(
  companyId: string,
  organizationId: string,
  newStagger: number
): Promise<number> {
  const correctQuarterEnds = calculateVATQuarterEnds(newStagger);
  let updated = 0;

  const { data: deadlines } = await supabase
    .from("deadlines")
    .select("*")
    .eq("company_id", companyId)
    .eq("organization_id", organizationId)
    .eq("deadline_type", "vat_return")
    .eq("status", "pending");

  for (const deadline of deadlines || []) {
    const currentDue = new Date(deadline.due_date);
    
    // Find correct deadline based on new stagger
    const matchingQuarter = correctQuarterEnds.find((q) => {
      const quarterDeadline = addDays(addMonths(q, 1), 7);
      return Math.abs(quarterDeadline.getTime() - currentDue.getTime()) < 45 * 24 * 60 * 60 * 1000;
    });

    if (matchingQuarter) {
      const newDueDate = addDays(addMonths(matchingQuarter, 1), 7);
      if (format(newDueDate, "yyyy-MM-dd") !== deadline.due_date) {
        await supabase
          .from("deadlines")
          .update({ due_date: format(newDueDate, "yyyy-MM-dd") })
          .eq("id", deadline.id);

        await logAudit({
          organizationId,
          entityType: "deadline",
          entityId: deadline.id,
          action: "update",
          fieldName: "due_date",
          oldValue: deadline.due_date,
          newValue: format(newDueDate, "yyyy-MM-dd"),
          metadata: { reason: `VAT stagger changed to ${newStagger}`, source: "exception_handler" },
        });

        updated++;
      }
    }
  }

  return updated;
}

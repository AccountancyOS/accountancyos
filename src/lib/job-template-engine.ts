import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./audit-service";
import { 
  EntityContext, 
  evaluateTriggerConditions, 
  evaluateEntityFilters,
  JobTemplateContent,
  TriggerCondition,
  EntityFilter,
  TaskTemplate,
  RecordsRequestItem,
} from "./job-template-types";
import { addDays, addMonths, startOfMonth, endOfMonth, format } from "date-fns";

// =====================================================
// Types
// =====================================================

export interface GenerateJobOptions {
  periodStart?: Date;
  periodEnd?: Date;
  filingDeadline?: Date;
  generationReason: string;
  skipConditionCheck?: boolean;
}

export interface GenerateJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface TemplateVersionResult {
  success: boolean;
  version?: number;
  versionId?: string;
  error?: string;
}

// =====================================================
// Core Job Generation
// =====================================================

/**
 * Generates a job from a template for a specific entity
 * This is the primary function called by automation and manual triggers
 */
export async function generateJobFromTemplate(
  templateId: string,
  organizationId: string,
  entity: { type: "company" | "client"; id: string },
  options: GenerateJobOptions
): Promise<GenerateJobResult> {
  try {
    // 1. Fetch template with all details
    const { data: template, error: templateError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    // 2. Fetch entity details for context
    const context = await buildEntityContext(entity, organizationId);
    if (!context) {
      return { success: false, error: "Could not build entity context" };
    }

    // 3. Evaluate trigger conditions (unless skipped)
    if (!options.skipConditionCheck) {
      const triggerConditions = (template.trigger_conditions || []) as TriggerCondition[];
      if (!evaluateTriggerConditions(triggerConditions, context)) {
        return { 
          success: true, 
          skipped: true, 
          skipReason: "Trigger conditions not met" 
        };
      }

      const entityFilters = template.entity_filters as EntityFilter | undefined;
      if (!evaluateEntityFilters(entityFilters, context)) {
        return { 
          success: true, 
          skipped: true, 
          skipReason: "Entity filters not matched" 
        };
      }
    }

    // 4. Check for existing job to prevent duplicates (idempotency)
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("template_id", templateId)
      .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
      .eq("period_start", options.periodStart?.toISOString().split("T")[0] || null)
      .eq("period_end", options.periodEnd?.toISOString().split("T")[0] || null)
      .maybeSingle();

    if (existingJob) {
      return { 
        success: true, 
        skipped: true, 
        skipReason: "Job already exists for this period",
        jobId: existingJob.id
      };
    }

    // 5. Calculate job dates
    const jobStart = options.periodStart || new Date();
    const filingDeadline = options.filingDeadline || 
      addDays(options.periodEnd || jobStart, template.relative_due_offset || 30);

    // 6. Parse template content
    const templateContent = (template.tasks || {}) as JobTemplateContent;

    // 7. Generate job name
    const jobName = generateJobName(template.name, options.periodStart, options.periodEnd);

    // 8. Create the job
    const { data: newJob, error: jobError } = await supabase
      .from("jobs")
      .insert({
        organization_id: organizationId,
        name: jobName,
        service_type: template.service_type,
        status: "not_started",
        priority: "normal",
        template_id: templateId,
        template_version: template.version,
        generation_reason: options.generationReason,
        auto_generated_at: new Date().toISOString(),
        can_undo_until: addDays(new Date(), 1).toISOString(), // 24-hour undo window
        filing_deadline: filingDeadline.toISOString().split("T")[0],
        period_start: options.periodStart?.toISOString().split("T")[0] || null,
        period_end: options.periodEnd?.toISOString().split("T")[0] || null,
        ...(entity.type === "company" ? { company_id: entity.id } : { client_id: entity.id }),
      })
      .select()
      .single();

    if (jobError || !newJob) {
      return { success: false, error: jobError?.message || "Failed to create job" };
    }

    // 9. Create tasks from template
    if (templateContent.tasks && templateContent.tasks.length > 0) {
      await createTasksFromTemplate(
        newJob.id,
        organizationId,
        templateContent.tasks,
        context,
        {
          jobStart,
          jobEnd: filingDeadline,
          periodStart: options.periodStart,
          periodEnd: options.periodEnd,
          filingDeadline,
        }
      );
    }

    // 10. Create records requests (as client tasks)
    if (templateContent.recordsRequests && templateContent.recordsRequests.length > 0) {
      await createRecordsRequestsFromTemplate(
        newJob.id,
        organizationId,
        entity,
        templateContent.recordsRequests,
        context
      );
    }

    // 11. Log audit entry
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: newJob.id,
      action: "create",
      metadata: {
        source: "job_template_engine",
        template_id: templateId,
        template_version: template.version,
        generation_reason: options.generationReason,
        auto_generated: true,
      },
    });

    return { success: true, jobId: newJob.id };
  } catch (error) {
    console.error("Error generating job from template:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Generates jobs when a service/engagement is activated
 */
export async function generateJobsForServiceActivation(
  organizationId: string,
  entity: { type: "company" | "client"; id: string },
  serviceCode: string
): Promise<GenerateJobResult[]> {
  const results: GenerateJobResult[] = [];

  try {
    // Find templates for this service
    const { data: templates, error } = await supabase
      .from("job_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .or(`trigger_type.eq.service_activated,service_type.eq.${serviceCode}`);

    if (error || !templates || templates.length === 0) {
      return [{ success: true, skipped: true, skipReason: "No templates found for service" }];
    }

    // Calculate next period based on service type
    const periodDates = calculateNextPeriod(serviceCode, entity);

    for (const template of templates) {
      const result = await generateJobFromTemplate(
        template.id,
        organizationId,
        entity,
        {
          periodStart: periodDates.start,
          periodEnd: periodDates.end,
          filingDeadline: periodDates.deadline,
          generationReason: `Service "${serviceCode}" activated`,
        }
      );
      results.push(result);
    }

    return results;
  } catch (error) {
    return [{ success: false, error: (error as Error).message }];
  }
}

/**
 * Rolling job generation - creates NEXT job only when needed
 * Called by scheduler or when previous job is filed
 */
export async function generateRecurringJobs(
  organizationId: string,
  options?: { 
    dryRun?: boolean;
    daysAhead?: number; // How many days before period to generate
  }
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const results = { generated: 0, skipped: 0, errors: [] as string[] };
  const daysAhead = options?.daysAhead ?? 14;

  try {
    // Get all active recurring templates
    const { data: templates, error: templatesError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("frequency", ["monthly", "quarterly", "annual"]);

    if (templatesError || !templates) {
      results.errors.push("Failed to fetch templates");
      return results;
    }

    // Get all entities (companies + clients) with active engagements
    const { data: engagements, error: engagementsError } = await supabase
      .from("engagements")
      .select(`
        id,
        client_id,
        company_id,
        services_catalog!inner(service_code)
      `)
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (engagementsError || !engagements) {
      results.errors.push("Failed to fetch engagements");
      return results;
    }

    const today = new Date();

    for (const template of templates) {
      for (const engagement of engagements) {
        const entity: { type: "company" | "client"; id: string } = engagement.company_id
          ? { type: "company", id: engagement.company_id }
          : { type: "client", id: engagement.client_id! };

        // Calculate next period for this template/entity
        const nextPeriod = await calculateNextPeriodForEntity(
          template,
          entity,
          organizationId
        );

        if (!nextPeriod) {
          results.skipped++;
          continue;
        }

        // Only generate if period starts within daysAhead
        const daysUntilPeriodStart = Math.ceil(
          (nextPeriod.start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilPeriodStart > daysAhead) {
          results.skipped++;
          continue;
        }

        if (options?.dryRun) {
          results.generated++;
          continue;
        }

        const result = await generateJobFromTemplate(
          template.id,
          organizationId,
          entity,
          {
            periodStart: nextPeriod.start,
            periodEnd: nextPeriod.end,
            filingDeadline: nextPeriod.deadline,
            generationReason: `Rolling generation: ${template.frequency} job for upcoming period`,
          }
        );

        if (result.success && !result.skipped) {
          results.generated++;
        } else if (result.skipped) {
          results.skipped++;
        } else {
          results.errors.push(result.error || "Unknown error");
        }
      }
    }

    return results;
  } catch (error) {
    results.errors.push((error as Error).message);
    return results;
  }
}

/**
 * Publishes a new version of a template
 */
export async function publishTemplateVersion(
  templateId: string,
  organizationId: string,
  changeNotes: string,
  options?: { applyToDraftJobs?: boolean }
): Promise<TemplateVersionResult> {
  try {
    // Get current template
    const { data: template, error: templateError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("id", templateId)
      .eq("organization_id", organizationId)
      .single();

    if (templateError || !template) {
      return { success: false, error: "Template not found" };
    }

    const newVersion = (template.version || 1) + 1;

    // Create version snapshot
    const { data: versionRecord, error: versionError } = await supabase
      .from("template_versions")
      .insert({
        template_id: templateId,
        version: newVersion,
        content: template.tasks || {},
        metadata: {
          name: template.name,
          service_type: template.service_type,
          frequency: template.frequency,
          trigger_type: template.trigger_type,
          trigger_conditions: template.trigger_conditions,
          entity_filters: template.entity_filters,
          records_requests_template: template.records_requests_template,
        },
        change_notes: changeNotes,
        published_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (versionError) {
      return { success: false, error: versionError.message };
    }

    // Update template version
    const { error: updateError } = await supabase
      .from("job_templates")
      .update({ version: newVersion })
      .eq("id", templateId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Optionally apply to draft jobs
    if (options?.applyToDraftJobs) {
      await supabase
        .from("jobs")
        .update({ template_version: newVersion })
        .eq("template_id", templateId)
        .eq("status", "not_started");
    }

    // Audit log
    await logAudit({
      organizationId,
      entityType: "job_template",
      entityId: templateId,
      action: "update",
      fieldName: "version",
      oldValue: String(template.version || 1),
      newValue: String(newVersion),
      metadata: { change_notes: changeNotes },
    });

    return { 
      success: true, 
      version: newVersion, 
      versionId: versionRecord.id 
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Rollback a job generation (admin only, within 24-hour window)
 */
export async function rollbackJobGeneration(
  jobId: string,
  organizationId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .single();

    if (jobError || !job) {
      return { success: false, error: "Job not found" };
    }

    // Check if within undo window
    if (!job.can_undo_until || new Date(job.can_undo_until) < new Date()) {
      return { success: false, error: "Undo window has expired (24 hours)" };
    }

    // Check if job has been worked on
    if (job.status !== "not_started") {
      return { success: false, error: "Cannot undo a job that has been started" };
    }

    // Delete associated tasks first
    await supabase
      .from("job_tasks")
      .delete()
      .eq("job_id", jobId);

    // Delete associated client tasks
    await supabase
      .from("client_tasks")
      .delete()
      .eq("template_id", jobId); // Records requests are linked via template_id

    // Delete the job
    const { error: deleteError } = await supabase
      .from("jobs")
      .delete()
      .eq("id", jobId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Audit log
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: jobId,
      action: "delete",
      metadata: {
        reason,
        rollback: true,
        original_generation_reason: job.generation_reason,
      },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// =====================================================
// Helper Functions
// =====================================================

async function buildEntityContext(
  entity: { type: "company" | "client"; id: string },
  organizationId: string
): Promise<EntityContext | null> {
  const context: EntityContext = {};

  if (entity.type === "company") {
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", entity.id)
      .single();

    if (company) {
      context.company = {
        id: company.id,
        vat_stagger: company.vat_stagger_group,
        vat_frequency: company.vat_frequency,
        year_end_month: company.year_end_month,
        year_end_day: company.year_end_day,
        company_type: company.company_type,
        vat_number: company.vat_number,
        vat_scheme: company.vat_scheme,
      };
    }
  } else {
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", entity.id)
      .single();

    if (client) {
      context.client = {
        id: client.id,
        status: client.status,
        utr: client.utr,
      };
    }
  }

  return context;
}

function generateJobName(
  templateName: string,
  periodStart?: Date,
  periodEnd?: Date
): string {
  if (!periodStart && !periodEnd) {
    return templateName;
  }

  if (periodStart && periodEnd) {
    // Check if it's a full year
    const startMonth = periodStart.getMonth();
    const endMonth = periodEnd.getMonth();
    const startYear = periodStart.getFullYear();
    const endYear = periodEnd.getFullYear();

    if (startMonth === 0 && endMonth === 11 && startYear === endYear) {
      return `${templateName} ${startYear}`;
    }

    // Check if it's a quarter
    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
    if (monthsDiff === 2) {
      const quarter = Math.floor(startMonth / 3) + 1;
      return `${templateName} Q${quarter} ${startYear}`;
    }

    // Monthly
    if (monthsDiff === 0) {
      return `${templateName} ${format(periodStart, "MMMM yyyy")}`;
    }
  }

  // Default: include period dates
  const startStr = periodStart ? format(periodStart, "dd/MM/yyyy") : "";
  const endStr = periodEnd ? format(periodEnd, "dd/MM/yyyy") : "";
  return `${templateName} ${startStr} - ${endStr}`.trim();
}

function calculateNextPeriod(
  serviceCode: string,
  entity: { type: "company" | "client"; id: string }
): { start: Date; end: Date; deadline: Date } {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Default: next month
  let start = startOfMonth(addMonths(today, 1));
  let end = endOfMonth(start);
  let deadline = addDays(end, 30);

  // Adjust based on service type
  switch (serviceCode.toUpperCase()) {
    case "VAT":
      // Next quarter end
      const quarterMonth = Math.floor(currentMonth / 3) * 3 + 3;
      start = startOfMonth(new Date(currentYear, quarterMonth - 3, 1));
      end = endOfMonth(new Date(currentYear, quarterMonth - 1, 1));
      deadline = addDays(end, 37); // 1 month + 7 days
      break;
    case "PAYROLL":
    case "BOOKKEEPING":
      // Next month
      start = startOfMonth(addMonths(today, 1));
      end = endOfMonth(start);
      deadline = addDays(end, 19);
      break;
    case "ACCOUNTS":
    case "CT":
      // Next year end - this would typically come from company data
      start = new Date(currentYear + 1, 0, 1);
      end = new Date(currentYear + 1, 11, 31);
      deadline = addMonths(end, 9);
      break;
  }

  return { start, end, deadline };
}

async function calculateNextPeriodForEntity(
  template: any,
  entity: { type: "company" | "client"; id: string },
  organizationId: string
): Promise<{ start: Date; end: Date; deadline: Date } | null> {
  // Find the latest job for this template/entity
  const { data: latestJob } = await supabase
    .from("jobs")
    .select("period_start, period_end, status")
    .eq("organization_id", organizationId)
    .eq("template_id", template.id)
    .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = new Date();

  if (!latestJob) {
    // No previous job - calculate based on current period
    return calculateNextPeriod(template.service_type || "", entity);
  }

  // Only generate next if previous is filed or approaching
  if (latestJob.status !== "completed" && latestJob.status !== "filed") {
    // Previous job not complete - don't generate yet (rolling generation)
    return null;
  }

  // Calculate next period based on frequency
  const lastEnd = new Date(latestJob.period_end);
  let start: Date;
  let end: Date;

  switch (template.frequency) {
    case "monthly":
      start = startOfMonth(addMonths(lastEnd, 1));
      end = endOfMonth(start);
      break;
    case "quarterly":
      start = startOfMonth(addMonths(lastEnd, 1));
      end = endOfMonth(addMonths(start, 2));
      break;
    case "annual":
      start = addMonths(lastEnd, 1);
      start = new Date(start.getFullYear(), lastEnd.getMonth() + 1, 1);
      end = addMonths(start, 12);
      end = addDays(end, -1);
      break;
    default:
      return null;
  }

  const deadline = addDays(end, template.relative_due_offset || 30);

  return { start, end, deadline };
}

async function createTasksFromTemplate(
  jobId: string,
  organizationId: string,
  tasks: TaskTemplate[],
  context: EntityContext,
  dates: {
    jobStart: Date;
    jobEnd: Date;
    periodStart?: Date;
    periodEnd?: Date;
    filingDeadline: Date;
  }
): Promise<void> {
  const taskRecords = [];

  for (const task of tasks) {
    // Evaluate conditional logic
    if (task.showIf) {
      const conditionMet = evaluateTriggerConditions([task.showIf as any], context);
      if (!conditionMet) continue;
    }

    // Calculate due date
    let dueDate: Date | null = null;
    if (task.relativeDueDays !== undefined) {
      const reference = getDateReference(task.relativeDueReference, dates);
      dueDate = addDays(reference, task.relativeDueDays);
    }

    taskRecords.push({
      job_id: jobId,
      organization_id: organizationId,
      title: task.name,
      description: task.description || null,
      status: "pending",
      due_date: dueDate?.toISOString().split("T")[0] || null,
      task_order: task.order,
      visibility: task.isClientFacing ? "client_visible" : "internal",
    });
  }

  if (taskRecords.length > 0) {
    await supabase.from("job_tasks").insert(taskRecords);
  }
}

async function createRecordsRequestsFromTemplate(
  jobId: string,
  organizationId: string,
  entity: { type: "company" | "client"; id: string },
  requests: RecordsRequestItem[],
  context: EntityContext
): Promise<void> {
  const taskRecords = [];

  for (const request of requests) {
    // Evaluate conditional logic
    if (request.showIf) {
      const conditionMet = evaluateTriggerConditions([request.showIf as any], context);
      if (!conditionMet) continue;
    }

    // Create as client_tasks (same structure used by client portal)
    taskRecords.push({
      organization_id: organizationId,
      ...(entity.type === "company" ? { company_id: entity.id } : { client_id: entity.id }),
      title: request.name,
      description: request.description || null,
      status: "pending",
      visibility: "client_visible",
      template_id: jobId, // Link to job for tracking
    });
  }

  if (taskRecords.length > 0) {
    await supabase.from("client_tasks").insert(taskRecords);
  }
}

function getDateReference(
  reference: string,
  dates: {
    jobStart: Date;
    jobEnd: Date;
    periodStart?: Date;
    periodEnd?: Date;
    filingDeadline: Date;
  }
): Date {
  switch (reference) {
    case "job_start":
      return dates.jobStart;
    case "job_end":
      return dates.jobEnd;
    case "filing_deadline":
      return dates.filingDeadline;
    case "period_start":
      return dates.periodStart || dates.jobStart;
    case "period_end":
      return dates.periodEnd || dates.jobEnd;
    default:
      return dates.jobEnd;
  }
}

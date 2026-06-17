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

// Extended type for template with new columns
type ExtendedTemplate = Record<string, unknown> & {
  id: string;
  template_name?: string;
  name?: string;
  service_type: string;
  tasks: unknown;
  trigger_conditions?: unknown;
  entity_filters?: unknown;
  relative_due_offset?: number;
  version?: number;
  frequency?: string;
};

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
    const { data: templateData, error: templateError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !templateData) {
      return { success: false, error: "Template not found" };
    }

    const template = templateData as ExtendedTemplate;

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
    const templateName = template.template_name || template.name || "Job";
    const jobName = generateJobName(templateName, options.periodStart, options.periodEnd);

    // 8. Create the job
    const jobInsertData: Record<string, unknown> = {
      organization_id: organizationId,
      name: jobName,
      service_type: template.service_type,
      status: "blank",
      priority: "normal",
      template_id: templateId,
      template_version: template.version || 1,
      generation_reason: options.generationReason,
      auto_generated_at: new Date().toISOString(),
      can_undo_until: addDays(new Date(), 1).toISOString(), // 24-hour undo window
      filing_deadline: filingDeadline.toISOString().split("T")[0],
      period_start: options.periodStart?.toISOString().split("T")[0] || null,
      period_end: options.periodEnd?.toISOString().split("T")[0] || null,
    };

    if (entity.type === "company") {
      jobInsertData.company_id = entity.id;
    } else {
      jobInsertData.client_id = entity.id;
    }

    const { data: newJob, error: jobError } = await supabase
      .from("jobs")
      .insert({
        organization_id: organizationId,
        job_name: jobName,
        service_type: template.service_type,
        status: "blank",
        priority: "normal",
        template_id: templateId,
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
        template_version: template.version || 1,
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
    const { data: templatesData, error } = await supabase
      .from("job_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .or(`trigger_type.eq.service_activated,service_type.eq.${serviceCode}`);

    if (error || !templatesData || templatesData.length === 0) {
      return [{ success: true, skipped: true, skipReason: "No templates found for service" }];
    }

    const templates = templatesData as ExtendedTemplate[];

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
    const { data: templatesData, error: templatesError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (templatesError || !templatesData) {
      results.errors.push("Failed to fetch templates");
      return results;
    }

    // Filter by frequency
    const templates = (templatesData as ExtendedTemplate[]).filter(
      t => ["monthly", "quarterly", "annual"].includes((t.frequency as string) || "")
    );

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
    const { data: templateData, error: templateError } = await supabase
      .from("job_templates")
      .select("*")
      .eq("id", templateId)
      .eq("organization_id", organizationId)
      .single();

    if (templateError || !templateData) {
      return { success: false, error: "Template not found" };
    }

    const template = templateData as ExtendedTemplate;
    const newVersion = ((template.version as number) || 1) + 1;

    // Create version snapshot
    const userId = (await supabase.auth.getUser()).data.user?.id || null;
    const contentJson = JSON.parse(JSON.stringify(template.tasks || {}));
    const { data: versionRecord, error: versionError } = await supabase
      .from("template_versions")
      .insert([{
        template_id: templateId,
        version_number: newVersion,
        content: contentJson,
        change_notes: changeNotes,
        created_by: userId,
      }])
      .select()
      .single();

    if (versionError) {
      return { success: false, error: versionError.message };
    }

    // Update template version
    const { error: updateError } = await supabase
      .from("job_templates")
      .update({ version: newVersion } as Record<string, unknown>)
      .eq("id", templateId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Optionally apply to draft jobs
    if (options?.applyToDraftJobs) {
      await supabase
        .from("jobs")
        .update({ template_version: newVersion } as Record<string, unknown>)
        .eq("template_id", templateId)
        .eq("status", "blank");
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

    // Check if within undo window (using type assertion for new column)
    const jobExtended = job as unknown as { can_undo_until?: string; status: string };
    if (!jobExtended.can_undo_until || new Date(jobExtended.can_undo_until) < new Date()) {
      return { success: false, error: "Undo window has expired (24 hours)" };
    }

    // Check if job has been worked on
    if (jobExtended.status !== "blank") {
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

    // Log the rollback
    await logAudit({
      organizationId,
      entityType: "job",
      entityId: jobId,
      action: "rollback",
      metadata: {
        reason,
        rolled_back_at: new Date().toISOString(),
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

/**
 * Builds entity context for template evaluation
 */
async function buildEntityContext(
  entity: { type: "company" | "client"; id: string },
  organizationId: string
): Promise<EntityContext | null> {
  try {
    if (entity.type === "company") {
      const { data: company, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", entity.id)
        .single();

      if (error || !company) return null;

      return {
        entityType: "company",
        entityId: entity.id,
        organizationId,
        company: {
          id: company.id,
          company_name: company.company_name,
          company_number: company.company_number,
          vat_registered: !!company.vat_number,
          vat_frequency: company.vat_frequency,
          vat_stagger_group: company.vat_stagger_group,
          year_end_month: company.year_end_month,
          year_end_day: company.year_end_day,
          status: company.status,
        },
      };
    } else {
      const { data: client, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", entity.id)
        .single();

      if (error || !client) return null;

      return {
        entityType: "client",
        entityId: entity.id,
        organizationId,
        client: {
          id: client.id,
          first_name: client.first_name,
          last_name: client.last_name,
          email: client.email,
          status: client.status,
        },
      };
    }
  } catch {
    return null;
  }
}

/**
 * Generates a human-readable job name
 */
function generateJobName(
  templateName: string,
  periodStart?: Date,
  periodEnd?: Date
): string {
  if (periodStart && periodEnd) {
    const startMonth = format(periodStart, "MMM yyyy");
    const endMonth = format(periodEnd, "MMM yyyy");
    if (startMonth === endMonth) {
      return `${templateName} - ${startMonth}`;
    }
    return `${templateName} - ${format(periodStart, "MMM")} to ${endMonth}`;
  }
  return templateName;
}

/**
 * Calculates next period dates based on service type
 */
function calculateNextPeriod(
  serviceCode: string,
  entity: { type: "company" | "client"; id: string }
): { start: Date; end: Date; deadline: Date } {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Default: next month period
  let start = startOfMonth(addMonths(now, 1));
  let end = endOfMonth(start);
  let deadline = addDays(end, 30);

  // Adjust based on service
  if (serviceCode === "VAT") {
    // Quarterly VAT - find next quarter end
    const quarterMonth = Math.floor(currentMonth / 3) * 3 + 2;
    start = new Date(currentYear, quarterMonth - 2, 1);
    end = new Date(currentYear, quarterMonth + 1, 0);
    deadline = addDays(end, 37); // 1 month + 7 days
  } else if (serviceCode === "ACCOUNTS" || serviceCode === "CT600") {
    // Annual - use year end (default to March 31)
    end = new Date(currentYear, 2, 31);
    if (end < now) {
      end = new Date(currentYear + 1, 2, 31);
    }
    start = addMonths(end, -11);
    start = new Date(start.getFullYear(), start.getMonth(), 1);
    deadline = addMonths(end, 9); // 9 months after year end
  }

  return { start, end, deadline };
}

/**
 * Calculates next period for a specific entity and template
 */
async function calculateNextPeriodForEntity(
  template: ExtendedTemplate,
  entity: { type: "company" | "client"; id: string },
  organizationId: string
): Promise<{ start: Date; end: Date; deadline: Date } | null> {
  // Get the last job for this template/entity
  const { data: lastJob } = await supabase
    .from("jobs")
    .select("period_start, period_end, status")
    .eq("template_id", template.id)
    .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const frequency = template.frequency || "monthly";

  if (!lastJob) {
    // No previous job - calculate from current date
    return calculateNextPeriod(template.service_type || "OTHER", entity);
  }

  // Calculate next period based on frequency
  const lastEnd = new Date(lastJob.period_end);
  let nextStart: Date;
  let nextEnd: Date;

  switch (frequency) {
    case "monthly":
      nextStart = addDays(lastEnd, 1);
      nextEnd = endOfMonth(nextStart);
      break;
    case "quarterly":
      nextStart = addDays(lastEnd, 1);
      nextEnd = endOfMonth(addMonths(nextStart, 2));
      break;
    case "annual":
      nextStart = addDays(lastEnd, 1);
      nextEnd = addMonths(lastEnd, 12);
      break;
    default:
      return null;
  }

  const deadline = addDays(nextEnd, template.relative_due_offset || 30);

  return { start: nextStart, end: nextEnd, deadline };
}

/**
 * Creates job tasks from template tasks
 */
async function createTasksFromTemplate(
  jobId: string,
  organizationId: string,
  taskTemplates: TaskTemplate[],
  context: EntityContext,
  dates: {
    jobStart: Date;
    jobEnd: Date;
    periodStart?: Date;
    periodEnd?: Date;
    filingDeadline?: Date;
  }
): Promise<void> {
  const tasksToInsert = taskTemplates.map((taskTemplate, index) => {
    // Calculate due date based on reference
    let dueDate = dates.jobEnd;
    const offset = taskTemplate.relativeDueDays || 0;

    switch (taskTemplate.relativeDueReference) {
      case "job_start":
        dueDate = addDays(dates.jobStart, offset);
        break;
      case "job_end":
        dueDate = addDays(dates.jobEnd, offset);
        break;
      case "filing_deadline":
        dueDate = dates.filingDeadline ? addDays(dates.filingDeadline, offset) : dates.jobEnd;
        break;
      case "period_start":
        dueDate = dates.periodStart ? addDays(dates.periodStart, offset) : dates.jobStart;
        break;
      case "period_end":
        dueDate = dates.periodEnd ? addDays(dates.periodEnd, offset) : dates.jobEnd;
        break;
    }

    return {
      job_id: jobId,
      organization_id: organizationId,
      title: taskTemplate.name,
      description: taskTemplate.description || null,
      // job_tasks_status_check: {todo, doing, done, blocked}
      status: "todo",
      task_order: index,
      due_date: dueDate.toISOString().split("T")[0],
      is_client_visible: taskTemplate.isClientFacing,
    };
  });

  if (tasksToInsert.length > 0) {
    await supabase.from("job_tasks").insert(tasksToInsert);
  }
}

/**
 * Creates client tasks (records requests) from template
 */
async function createRecordsRequestsFromTemplate(
  jobId: string,
  organizationId: string,
  entity: { type: "company" | "client"; id: string },
  requests: RecordsRequestItem[],
  context: EntityContext
): Promise<void> {
  const tasksToInsert = requests.map((request, index) => ({
    organization_id: organizationId,
    title: request.name,
    description: request.description || `Please upload: ${request.name}`,
    // client_tasks_status_check: {not_started, in_progress, complete}
    status: "not_started",
    // client_tasks_visibility_check: {client_visible, internal_only}
    visibility: "client_visible" as const,
    task_order: index,
    template_id: jobId, // Link to job for reference
    ...(entity.type === "company" ? { company_id: entity.id } : { client_id: entity.id }),
  }));

  if (tasksToInsert.length > 0) {
    await supabase.from("client_tasks").insert(tasksToInsert);
  }
}
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// Action types supported by the automation engine
export type AutomationActionType = 
  | 'create_job'
  | 'create_task'
  | 'send_email'
  | 'send_notification';

interface ActionContext {
  organizationId: string;
  triggeredByEntity: string;
  triggeredById: string;
  metadata?: Record<string, unknown>;
}

interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Execute a create_job action.
 * Creates a new job with specified parameters.
 * REQUIRES serviceType in actionConfig (per schema).
 */
async function executeCreateJob(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  try {
    const {
      templateId,
      clientId,
      companyId,
      jobName,
      serviceType,
      dueDate,
    } = config as {
      templateId?: string;
      clientId?: string;
      companyId?: string;
      jobName?: string;
      serviceType?: string;
      dueDate?: string;
    };

    // Enforce serviceType – automation rules must provide it
    if (!serviceType) {
      return {
        success: false,
        error: "create_job action requires serviceType in actionConfig",
      };
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        organization_id: context.organizationId,
        job_name: jobName || 'Auto-generated Job',
        service_type: serviceType,
        status: 'blank',
        client_id: clientId ?? null,
        company_id: companyId ?? null,
        filing_deadline: dueDate ?? null,
        template_id: templateId ?? null,
        is_auto_generated: true,
        auto_generated_at: new Date().toISOString(),
        automation_source: context.triggeredByEntity,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { jobId: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error creating job' };
  }
}

/**
 * Execute a create_task action.
 */
async function executeCreateTask(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  try {
    const { jobId, clientId, companyId, title, description, dueDate, visibility } = config as {
      jobId?: string;
      clientId?: string;
      companyId?: string;
      title: string;
      description?: string;
      dueDate?: string;
      visibility?: string;
    };

    const { data, error } = await supabase
      .from('client_tasks')
      .insert([{
        organization_id: context.organizationId,
        title: title || 'Auto-generated Task',
        status: 'not_started',
        visibility: visibility || 'internal',
        job_id: jobId || null,
        client_id: clientId || null,
        company_id: companyId || null,
        description: description || null,
        due_date: dueDate || null
      }])
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { taskId: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Execute a send_email action.
 */
async function executeSendEmail(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  try {
    const { templateId, toEmail, subject, mergeData, scheduledAt } = config as {
      templateId: string;
      toEmail: string;
      subject?: string;
      mergeData?: Record<string, unknown>;
      scheduledAt?: string;
    };

    const { data, error } = await supabase
      .from('email_queue')
      .insert([{
        organization_id: context.organizationId,
        to_email: toEmail,
        template_id: templateId,
        merge_data: (mergeData || {}) as Json,
        status: 'queued',
        scheduled_at: scheduledAt || new Date().toISOString(),
        subject: subject || null
      }])
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { emailQueueId: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Execute a send_notification action.
 */
async function executeSendNotification(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  try {
    const { userId, title, message, entityType, entityId, notificationType } = config as {
      userId: string;
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
      notificationType?: string;
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        organization_id: context.organizationId,
        title,
        message,
        type: notificationType || 'info',
        is_read: false,
        entity_type: entityType || null,
        entity_id: entityId || null
      }])
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { notificationId: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Main action executor - routes to specific action handlers.
 */
export async function executeAction(
  actionType: AutomationActionType,
  actionConfig: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  switch (actionType) {
    case 'create_job':
      return executeCreateJob(actionConfig, context);
    case 'create_task':
      return executeCreateTask(actionConfig, context);
    case 'send_email':
      return executeSendEmail(actionConfig, context);
    case 'send_notification':
      return executeSendNotification(actionConfig, context);
    default:
      return { success: false, error: `Unknown action type: ${actionType}` };
  }
}

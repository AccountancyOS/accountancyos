/**
 * Job Status Service
 * Centralized service for updating job status with automation trigger integration.
 * All job status changes should go through this service to ensure events are emitted.
 */

import { supabase } from "@/integrations/supabase/client";
import { emitJobStatusChange } from "./automation-triggers";
import { logAudit } from "./audit-service";

export type JobStatus = 
  | "not_started"
  | "in_progress"
  | "waiting_on_client"
  | "ready_for_review"
  | "in_review"
  | "completed"
  | "on_hold"
  | "cancelled";

interface UpdateJobStatusOptions {
  reason?: string;
  userId?: string;
  skipAutomation?: boolean;
}

interface UpdateJobStatusResult {
  success: boolean;
  error?: string;
  eventId?: string | null;
}

/**
 * Update a job's status with proper automation trigger emission.
 * This is the canonical way to change job status in the application.
 */
export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  try {
    // 1. Fetch current job to get old status and organization_id
    const { data: job, error: fetchError } = await supabase
      .from("jobs")
      .select("id, organization_id, status, job_name, client_id, company_id, service_type")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return { success: false, error: fetchError?.message || "Job not found" };
    }

    const oldStatus = job.status;

    // Don't update if status is the same
    if (oldStatus === newStatus) {
      return { success: true };
    }

    // 2. Update the job status
    const { error: updateError } = await supabase
      .from("jobs")
      .update({ 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", jobId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // 3. Log audit trail
    await logAudit({
      organizationId: job.organization_id,
      entityType: "job",
      entityId: jobId,
      action: "status_change",
      fieldName: "status",
      oldValue: oldStatus,
      newValue: newStatus,
      metadata: { reason: options.reason },
    });

    // 4. Emit automation event (unless skipped)
    let eventId: string | null = null;
    if (!options.skipAutomation) {
      eventId = await emitJobStatusChange(
        job.organization_id,
        jobId,
        oldStatus,
        newStatus,
        {
          jobName: job.job_name,
          clientId: job.client_id,
          companyId: job.company_id,
          serviceType: job.service_type,
          reason: options.reason,
        }
      );
    }

    return { success: true, eventId };
  } catch (err) {
    console.error("[JobStatusService] Error updating job status:", err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch update multiple jobs to the same status.
 */
export async function batchUpdateJobStatus(
  jobIds: string[],
  newStatus: JobStatus,
  options: UpdateJobStatusOptions = {}
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const jobId of jobIds) {
    const result = await updateJobStatus(jobId, newStatus, options);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${jobId}: ${result.error}`);
    }
  }

  return results;
}

/**
 * Mark a job as completed with proper automation handling.
 */
export async function completeJob(
  jobId: string,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  return updateJobStatus(jobId, "completed", options);
}

/**
 * Mark a job as in progress.
 */
export async function startJob(
  jobId: string,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  return updateJobStatus(jobId, "in_progress", options);
}

/**
 * Mark a job as waiting on client.
 */
export async function setJobWaitingOnClient(
  jobId: string,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  return updateJobStatus(jobId, "waiting_on_client", options);
}

/**
 * Mark a job as ready for review.
 */
export async function submitJobForReview(
  jobId: string,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  return updateJobStatus(jobId, "ready_for_review", options);
}

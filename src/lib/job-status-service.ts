/**
 * Job Status Service
 * Centralized service for updating job status with automation trigger integration.
 * All job status changes should go through this service to ensure events are emitted.
 */

import { supabase } from "@/integrations/supabase/client";
import { emitJobStatusChange } from "./automation-triggers";
import { logAudit } from "./audit-service";
import { stopChaserRunsForJob } from "./chaser-policy-service";

export type JobStatus = 
  | "blank"
  | "records_requested"
  | "records_received"
  | "accountant_queries"
  | "client_queries"
  | "accountant_review"
  | "client_review"
  | "ready_to_file"
  | "completed";

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
  // Validate inputs
  if (!jobId || typeof jobId !== 'string') {
    return { success: false, error: "Invalid job ID provided" };
  }

  const validStatuses: JobStatus[] = [
    "blank", "records_requested", "records_received", "accountant_queries",
    "client_queries", "accountant_review", "client_review", "ready_to_file", "completed"
  ];

  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}` };
  }

  try {
    // 1. Fetch current job to get old status and organization_id
    const { data: job, error: fetchError } = await supabase
      .from("jobs")
      .select("id, organization_id, status, job_name, client_id, company_id, service_type")
      .eq("id", jobId)
      .single();

    if (fetchError) {
      console.error("[JobStatusService] Fetch error:", fetchError);
      return { success: false, error: `Failed to fetch job: ${fetchError.message}` };
    }

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const oldStatus = job.status;

    // Don't update if status is the same
    if (oldStatus === newStatus) {
      return { success: true };
    }

    // Validate status transitions (allow flexible movement but prevent going back from completed)
    const invalidTransitions: Record<string, JobStatus[]> = {
      completed: ["blank"], // Can't go from completed back to blank
    };

    if (invalidTransitions[oldStatus]?.includes(newStatus)) {
      return { 
        success: false, 
        error: `Invalid status transition from '${oldStatus}' to '${newStatus}'` 
      };
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
      console.error("[JobStatusService] Update error:", updateError);
      return { success: false, error: `Failed to update job: ${updateError.message}` };
    }

    // 3. Log audit trail
    try {
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
    } catch (auditErr) {
      console.warn("[JobStatusService] Failed to log audit:", auditErr);
      // Don't fail the operation for audit logging issues
    }

    // 4. Stop chaser runs if status is records_received
    if (newStatus === "records_received") {
      try {
        await stopChaserRunsForJob(jobId);
      } catch (chaserErr) {
        console.warn("[JobStatusService] Failed to stop chaser runs:", chaserErr);
        // Don't fail the operation for chaser stop issues
      }
    }

    // 5. Emit automation event (unless skipped)
    let eventId: string | null = null;
    if (!options.skipAutomation) {
      try {
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
      } catch (eventErr) {
        console.warn("[JobStatusService] Failed to emit automation event:", eventErr);
        // Don't fail the operation for automation event issues
      }
    }

    return { success: true, eventId };
  } catch (err) {
    console.error("[JobStatusService] Unexpected error:", err);
    return { success: false, error: `Unexpected error: ${(err as Error).message}` };
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
 * Mark a job as records requested.
 */
export async function setJobRecordsRequested(
  jobId: string,
  options: UpdateJobStatusOptions = {}
): Promise<UpdateJobStatusResult> {
  return updateJobStatus(jobId, "records_requested", options);
}

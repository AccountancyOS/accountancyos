// Filing Lock Service
// Manages locking/unlocking of filings with mandatory audit trail

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";
import { createFilingVersion } from "@/lib/filing-version-service";

export interface LockFilingParams {
  filingId: string;
  lockReason: string;
  captureSnapshots?: boolean; // defaults to true
}

export interface UnlockFilingParams {
  filingId: string;
  reason: string; // mandatory for audit trail
}

export interface LockResult {
  success: boolean;
  snapshotId?: string;
  version?: number;
  error?: string;
}

/**
 * Lock a filing: creates an immutable snapshot, sets is_locked + locked_at/by.
 * Used when "Send to Client" or "Submit" is triggered.
 */
export async function lockFiling(params: LockFilingParams): Promise<LockResult> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    // Check filing exists and is not already locked
    const { data: filing, error: fetchErr } = await supabase
      .from("filings")
      .select("id, status, is_locked, organization_id")
      .eq("id", params.filingId)
      .single();

    if (fetchErr || !filing) {
      return { success: false, error: "Filing not found" };
    }

    if (filing.is_locked) {
      return { success: false, error: "Filing is already locked" };
    }

    // Create version snapshot with TB + COA
    const captureSnapshots = params.captureSnapshots !== false;
    const versionResult = await createFilingVersion({
      filingId: params.filingId,
      lockReason: params.lockReason,
      includeTbSnapshot: captureSnapshots,
      includeCoaSnapshot: captureSnapshots,
    });

    if (!versionResult.success) {
      return { success: false, error: versionResult.error };
    }

    // Lock the filing
    const now = new Date().toISOString();
    const { error: lockErr } = await supabase
      .from("filings")
      .update({
        is_locked: true,
        locked_at: now,
        locked_by: userId,
      } as any)
      .eq("id", params.filingId);

    if (lockErr) {
      return { success: false, error: lockErr.message };
    }

    // Also lock linked workpaper instances
    await lockRelatedWorkpapers(params.filingId, userId);

    // Audit log
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: params.filingId,
      action: "lock",
      newValue: "locked",
      metadata: {
        lock_reason: params.lockReason,
        snapshot_id: versionResult.snapshotId,
        version: versionResult.version,
      },
      userId,
      reason: params.lockReason,
    });

    return {
      success: true,
      snapshotId: versionResult.snapshotId,
      version: versionResult.version,
    };
  } catch (err: any) {
    console.error("Lock filing error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Unlock a filing with mandatory reason for audit trail.
 * Requires owner/admin/manager role.
 */
export async function unlockFiling(params: UnlockFilingParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    if (!params.reason || params.reason.trim().length < 10) {
      return { success: false, error: "A detailed reason (min 10 characters) is required to unlock a filing" };
    }

    // Fetch filing
    const { data: filing, error: fetchErr } = await supabase
      .from("filings")
      .select("id, status, is_locked, organization_id, locked_at, locked_by")
      .eq("id", params.filingId)
      .single();

    if (fetchErr || !filing) {
      return { success: false, error: "Filing not found" };
    }

    if (!filing.is_locked) {
      return { success: false, error: "Filing is not locked" };
    }

    // Unlock the filing
    const { error: unlockErr } = await supabase
      .from("filings")
      .update({
        is_locked: false,
        locked_at: null,
        locked_by: null,
      } as any)
      .eq("id", params.filingId);

    if (unlockErr) {
      return { success: false, error: unlockErr.message };
    }

    // Unlock related workpapers
    await unlockRelatedWorkpapers(params.filingId);

    // Audit log with mandatory reason
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: params.filingId,
      action: "unlock",
      oldValue: "locked",
      newValue: "unlocked",
      metadata: {
        previous_locked_at: filing.locked_at,
        previous_locked_by: filing.locked_by,
      },
      userId,
      reason: params.reason,
    });

    return { success: true };
  } catch (err: any) {
    console.error("Unlock filing error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Transition filing to "sent_to_client" status.
 * This locks the filing and creates an immutable snapshot.
 */
export async function sendFilingToClient(
  filingId: string,
  message?: string
): Promise<LockResult> {
  // Lock filing with TB + COA snapshots
  const lockResult = await lockFiling({
    filingId,
    lockReason: "Sent to client for review",
    captureSnapshots: true,
  });

  if (!lockResult.success) return lockResult;

  // Update status to sent_to_client
  const { error } = await supabase
    .from("filings")
    .update({
      status: "sent_to_client",
      approval_requested_at: new Date().toISOString(),
    })
    .eq("id", filingId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Fetch filing for audit
  const { data: filing } = await supabase
    .from("filings")
    .select("organization_id")
    .eq("id", filingId)
    .single();

  if (filing) {
    const { data: authData } = await supabase.auth.getUser();
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: filingId,
      action: "send_to_client",
      newValue: "sent_to_client",
      metadata: { message, snapshot_id: lockResult.snapshotId, version: lockResult.version },
      userId: authData?.user?.id,
    });
  }

  return lockResult;
}

// ---------- Internal helpers ----------

async function lockRelatedWorkpapers(filingId: string, userId: string) {
  // Find workpaper linked to this filing
  const { data: filing } = await supabase
    .from("filings")
    .select("workpaper_instance_id")
    .eq("id", filingId)
    .single();

  if (filing?.workpaper_instance_id) {
    await supabase
      .from("workpaper_instances")
      .update({
        status: "finalised",
        finalised_at: new Date().toISOString(),
        finalised_by: userId,
      })
      .eq("id", filing.workpaper_instance_id)
      .is("finalised_at", null);
  }
}

async function unlockRelatedWorkpapers(filingId: string) {
  const { data: filing } = await supabase
    .from("filings")
    .select("workpaper_instance_id")
    .eq("id", filingId)
    .single();

  if (filing?.workpaper_instance_id) {
    await supabase
      .from("workpaper_instances")
      .update({ status: "in_progress" })
      .eq("id", filing.workpaper_instance_id)
      .eq("status", "finalised");
  }
}

/**
 * Permission Service
 * Server-side permission checks via Supabase RPCs
 */
import { supabase } from "@/integrations/supabase/client";

export type PermissionCheckResult = {
  success: boolean;
  error?: string;
};

// Server-side permission check wrappers
export async function checkCanModifyJobs(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_modify_jobs", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_modify_jobs:", error);
    return false;
  }
  return data === true;
}

export async function checkCanFinalizeWorkpapers(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_finalize_workpapers", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_finalize_workpapers:", error);
    return false;
  }
  return data === true;
}

export async function checkCanApproveFilings(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_approve_filings", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_approve_filings:", error);
    return false;
  }
  return data === true;
}

export async function checkCanSubmitFilings(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_submit_filings", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_submit_filings:", error);
    return false;
  }
  return data === true;
}

export async function checkCanManageTeam(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_manage_team", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_manage_team:", error);
    return false;
  }
  return data === true;
}

export async function checkCanManageAutomationRules(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_manage_automation_rules", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_manage_automation_rules:", error);
    return false;
  }
  return data === true;
}

export async function checkCanManageTemplates(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("can_manage_templates", {
    _user_id: user.id,
    _org_id: orgId,
  });

  if (error) {
    console.error("Error checking can_manage_templates:", error);
    return false;
  }
  return data === true;
}

// Safe RPC wrappers with audit logging built-in
export async function updateJobStatusSafe(
  jobId: string,
  newStatus: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("update_job_status_safe", {
    p_job_id: jobId,
    p_new_status: newStatus,
    p_reason: reason || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { success: boolean; error?: string };
  return result;
}

export async function finalizeWorkpaperSafe(
  workpaperId: string
): Promise<{ success: boolean; error?: string; filing_id?: string }> {
  const { data, error } = await supabase.rpc("finalize_workpaper_safe", {
    p_workpaper_id: workpaperId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string; filing_id?: string };
}

export async function approveFilingSafe(
  filingId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("approve_filing_safe", {
    p_filing_id: filingId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string };
}

export async function submitFilingSafe(
  filingId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("submit_filing_safe", {
    p_filing_id: filingId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string };
}

export async function updateDeadlineSafe(
  deadlineId: string,
  updates: { name?: string; due_date?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("update_deadline_safe", {
    p_deadline_id: deadlineId,
    p_updates: updates as unknown as Record<string, never>,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string };
}

export async function updateUserRoleSafe(
  targetUserId: string,
  orgId: string,
  newRole: string
): Promise<{ success: boolean; error?: string; old_role?: string; new_role?: string }> {
  const { data, error } = await supabase.rpc("update_user_role_safe", {
    p_target_user_id: targetUserId,
    p_org_id: orgId,
    p_new_role: newRole,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string; old_role?: string; new_role?: string };
}

// Get user permissions for current organization
export async function getUserPermissions(orgId: string): Promise<{
  role: string | null;
  permissions: Record<string, boolean>;
}> {
  const { data, error } = await supabase.rpc("get_user_permissions", {
    _org_id: orgId,
  });

  if (error) {
    console.error("Error getting user permissions:", error);
    return { role: null, permissions: {} };
  }

  return data as { role: string | null; permissions: Record<string, boolean> };
}

/**
 * Permission check names that correspond to RPC functions
 */
type PermissionName = 
  | "modify_jobs"
  | "finalize_workpapers"
  | "approve_filings"
  | "submit_filings"
  | "manage_team"
  | "manage_automation_rules"
  | "manage_templates";

/**
 * Batch check multiple permissions in parallel (single auth call)
 * More efficient than calling individual check functions when multiple permissions are needed
 */
export async function checkPermissionsBatch(
  orgId: string,
  permissions: PermissionName[]
): Promise<Record<PermissionName, boolean>> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return Object.fromEntries(permissions.map(p => [p, false])) as Record<PermissionName, boolean>;
  }

  const results = await Promise.all(
    permissions.map(async (perm) => {
      const { data, error } = await supabase.rpc(`can_${perm}`, {
        _user_id: user.id,
        _org_id: orgId,
      });
      return [perm, error ? false : data === true] as const;
    })
  );

  return Object.fromEntries(results) as Record<PermissionName, boolean>;
}

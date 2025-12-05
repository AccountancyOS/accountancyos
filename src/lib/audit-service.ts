import { supabase } from "@/integrations/supabase/client";

export type AuditEntityType = "trial_balance_snapshot" | "workpaper_instance" | "filing" | "pay_run" | "payslip" | "cis_return" | "cis_payment" | "employee";
export type AuditAction = "create" | "update" | "finalise" | "reopen" | "approve" | "reject" | "file" | "override" | "send_for_approval" | "client_approve" | "client_reject" | "api_submit" | "calculate" | "status_change" | "submit_rti" | "submit";

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export async function logAudit(params: {
  organizationId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  fieldName?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; auditId?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Direct insert using raw query approach
    const insertData = {
      organization_id: params.organizationId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      field_name: params.fieldName || null,
      old_value: params.oldValue !== undefined ? String(params.oldValue) : null,
      new_value: params.newValue !== undefined ? String(params.newValue) : null,
      user_id: user?.id || null,
      metadata: params.metadata || {},
    };

    // Insert audit log entry using rpc or direct query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from("audit_log")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log audit:", error);
      return { success: false, error: error.message };
    }

    return { success: true, auditId: data?.id };
  } catch (err: any) {
    console.error("Audit logging error:", err);
    return { success: false, error: err.message };
  }
}

export async function logOverride(params: {
  organizationId: string;
  entityType: AuditEntityType;
  entityId: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  level: "TB" | "Workpaper" | "Filing";
}): Promise<{ success: boolean }> {
  return logAudit({
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: "override",
    fieldName: params.fieldName,
    oldValue: params.oldValue,
    newValue: params.newValue,
    metadata: { level: params.level },
  });
}

export async function getAuditLog(
  entityType: AuditEntityType,
  entityId: string
): Promise<AuditLogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch audit log:", error);
    return [];
  }

  return (data || []) as AuditLogEntry[];
}

export async function getEntityAuditTrail(
  jobId: string
): Promise<AuditLogEntry[]> {
  // Get all related entities for a job (TB snapshots, workpapers, filings)
  const [tbSnapshots, workpapers, filings] = await Promise.all([
    supabase.from("trial_balance_snapshots").select("id").eq("job_id", jobId),
    supabase.from("workpaper_instances").select("id").eq("job_id", jobId),
    supabase.from("filings").select("id").eq("job_id", jobId),
  ]);

  const entityIds = [
    ...(tbSnapshots.data || []).map(s => s.id),
    ...(workpapers.data || []).map(w => w.id),
    ...(filings.data || []).map(f => f.id),
  ];

  if (entityIds.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("audit_log")
    .select("*")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch audit trail:", error);
    return [];
  }

  return (data || []) as AuditLogEntry[];
}

export async function checkCanFinalise(organizationId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check organization_users for owner/admin role
    const { data, error } = await supabase
      .from("organization_users")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (error || !data) return false;

    return ["owner", "admin"].includes(data.role);
  } catch {
    return false;
  }
}

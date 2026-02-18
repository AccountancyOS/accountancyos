/**
 * Audit Service
 * Frontend audit logging utilities with structured event tracking
 */
import { supabase } from "@/integrations/supabase/client";

// Extended entity types for comprehensive audit coverage
export type AuditEntityType = 
  | "trial_balance_snapshot" 
  | "workpaper_instance" 
  | "filing" 
  | "pay_run" 
  | "payslip" 
  | "cis_return" 
  | "cis_payment" 
  | "employee" 
  | "job" 
  | "deadline" 
  | "job_template"
  | "invoice"
  | "bill"
  | "payment"
  | "journal"
  | "client"
  | "company"
  | "customer"
  | "supplier"
  | "bank_transaction"
  | "vat_return"
  | "automation_rule"
  | "automation_override"
  | "template"
  | "document"
  | "user"
  | "organization";

// Extended action types
export type AuditAction = 
  | "create" 
  | "update" 
  | "delete"
  | "view"
  | "finalise" 
  | "reopen" 
  | "approve" 
  | "reject" 
  | "file" 
  | "override" 
  | "send_for_approval" 
  | "client_approve" 
  | "client_reject" 
  | "api_submit" 
  | "calculate" 
  | "status_change" 
  | "submit_rti" 
  | "submit" 
  | "rollback" 
  | "close" 
  | "generate"
  | "void"
  | "reverse"
  | "lock"
  | "unlock"
  | "login"
  | "logout"
  | "export"
  | "import"
  | "create_version"
  | "send_to_client"
  | "timing_reset";

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
  userId?: string;
  reason?: string;
}): Promise<{ success: boolean; auditId?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Direct insert using raw query approach
    const insertData: Record<string, any> = {
      organization_id: params.organizationId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      field_name: params.fieldName || null,
      old_value: params.oldValue !== undefined ? String(params.oldValue) : null,
      new_value: params.newValue !== undefined ? String(params.newValue) : null,
      user_id: params.userId || user?.id || null,
      metadata: params.metadata || {},
      reason: params.reason || null,
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

// ============ Convenience Wrappers ============

export const auditJobAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'job', entityId, action, metadata });

export const auditFilingAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'filing', entityId, action, metadata });

export const auditInvoiceAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'invoice', entityId, action, metadata });

export const auditBillAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'bill', entityId, action, metadata });

export const auditPaymentAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'payment', entityId, action, metadata });

export const auditJournalAction = (
  organizationId: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
) => logAudit({ organizationId, entityType: 'journal', entityId, action, metadata });

/**
 * Log a state transition with before/after values
 */
export async function logStateTransition(params: {
  organizationId: string;
  entityType: AuditEntityType;
  entityId: string;
  fromState: string;
  toState: string;
  reason?: string;
}): Promise<{ success: boolean; auditId?: string; error?: string }> {
  return logAudit({
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: 'status_change',
    fieldName: 'status',
    oldValue: params.fromState,
    newValue: params.toState,
    metadata: params.reason ? { reason: params.reason } : undefined,
  });
}

/**
 * Query recent activity for an organization
 */
export async function getRecentActivity(params: {
  organizationId: string;
  limit?: number;
  entityTypes?: AuditEntityType[];
  actions?: AuditAction[];
}): Promise<AuditLogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  let query = client
    .from("audit_log")
    .select("*")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(params.limit || 100);

  if (params.entityTypes?.length) {
    query = query.in("entity_type", params.entityTypes);
  }

  if (params.actions?.length) {
    query = query.in("action", params.actions);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch recent activity:", error);
    return [];
  }

  return (data || []) as AuditLogEntry[];
}

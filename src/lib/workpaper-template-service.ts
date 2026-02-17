/**
 * Workpaper Template Service — CRUD for practice-level workpaper templates
 * and auto-instantiation of templates onto jobs.
 */
import { supabase } from "@/integrations/supabase/client";

export interface WorkpaperTemplateRow {
  id: string;
  organization_id: string | null;
  job_type: string;
  name: string;
  description: string | null;
  schema_json: any;
  is_default: boolean;
  is_system: boolean;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobWorkpaperInstance {
  id: string;
  organization_id: string;
  job_id: string;
  client_id: string | null;
  company_id: string | null;
  template_id: string | null;
  template_version: number | null;
  name: string;
  instance_schema_json: any;
  instance_data_json: Record<string, any>;
  status: "draft" | "in_review" | "locked";
  locked_at: string | null;
  locked_by: string | null;
  lock_reason: string | null;
  prepared_by: string | null;
  prepared_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Templates ───────────────────────────────────────────────

/**
 * List templates visible to an org (system + org-specific)
 */
export async function listWorkpaperTemplates(
  organizationId: string,
  jobType?: string
): Promise<WorkpaperTemplateRow[]> {
  let query = supabase
    .from("workpaper_templates")
    .select("*")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq("is_active", true)
    .order("job_type")
    .order("name");

  if (jobType) {
    query = query.eq("job_type", jobType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WorkpaperTemplateRow[];
}

/**
 * Get a single template by ID
 */
export async function getWorkpaperTemplate(
  templateId: string
): Promise<WorkpaperTemplateRow | null> {
  const { data, error } = await supabase
    .from("workpaper_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as WorkpaperTemplateRow;
}

/**
 * Create or update an org-scoped template (increments version on update)
 */
export async function upsertWorkpaperTemplate(
  organizationId: string,
  template: {
    id?: string;
    job_type: string;
    name: string;
    description?: string;
    schema_json: any;
    is_default?: boolean;
  }
): Promise<WorkpaperTemplateRow> {
  const user = (await supabase.auth.getUser()).data.user;

  if (template.id) {
    // Update — bump version
    const existing = await getWorkpaperTemplate(template.id);
    const newVersion = (existing?.version ?? 0) + 1;

    const { data, error } = await supabase
      .from("workpaper_templates")
      .update({
        name: template.name,
        description: template.description ?? null,
        schema_json: template.schema_json,
        is_default: template.is_default ?? false,
        version: newVersion,
      })
      .eq("id", template.id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw error;
    return data as WorkpaperTemplateRow;
  } else {
    // If setting as default, unset any existing default for this job_type in this org
    if (template.is_default) {
      await supabase
        .from("workpaper_templates")
        .update({ is_default: false })
        .eq("organization_id", organizationId)
        .eq("job_type", template.job_type)
        .eq("is_default", true);
    }

    const { data, error } = await supabase
      .from("workpaper_templates")
      .insert({
        organization_id: organizationId,
        job_type: template.job_type,
        name: template.name,
        description: template.description ?? null,
        schema_json: template.schema_json,
        is_default: template.is_default ?? false,
        is_system: false,
        version: 1,
        is_active: true,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WorkpaperTemplateRow;
  }
}

/**
 * Soft-delete a template (set is_active = false). System templates cannot be deleted.
 */
export async function deactivateWorkpaperTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from("workpaper_templates")
    .update({ is_active: false })
    .eq("id", templateId)
    .eq("is_system", false);

  if (error) throw error;
}

// ─── Instances (job-level) ───────────────────────────────────

/**
 * List all workpaper instances for a job
 */
export async function listJobWorkpaperInstances(
  jobId: string
): Promise<JobWorkpaperInstance[]> {
  const { data, error } = await supabase
    .from("job_workpaper_instances")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as JobWorkpaperInstance[];
}

/**
 * Get a single instance
 */
export async function getJobWorkpaperInstance(
  instanceId: string
): Promise<JobWorkpaperInstance | null> {
  const { data, error } = await supabase
    .from("job_workpaper_instances")
    .select("*")
    .eq("id", instanceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as JobWorkpaperInstance;
}

/**
 * Resolve the best template for a job type in an org:
 * 1. Org-specific default for this job_type
 * 2. System default for this job_type
 * 3. null (no template found)
 */
export async function resolveDefaultTemplate(
  organizationId: string,
  jobType: string
): Promise<WorkpaperTemplateRow | null> {
  // Try org default first
  const { data: orgDefault } = await supabase
    .from("workpaper_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("job_type", jobType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (orgDefault) return orgDefault as WorkpaperTemplateRow;

  // Fall back to system default
  const { data: sysDefault } = await supabase
    .from("workpaper_templates")
    .select("*")
    .is("organization_id", null)
    .eq("job_type", jobType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  return (sysDefault as WorkpaperTemplateRow) ?? null;
}

/**
 * Auto-create a workpaper instance for a job from the resolved template.
 * Called when a job is created.
 */
export async function autoCreateWorkpaperInstance(
  organizationId: string,
  jobId: string,
  jobType: string,
  options?: { clientId?: string; companyId?: string }
): Promise<JobWorkpaperInstance | null> {
  const template = await resolveDefaultTemplate(organizationId, jobType);
  if (!template) return null;

  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from("job_workpaper_instances")
    .insert({
      organization_id: organizationId,
      job_id: jobId,
      client_id: options?.clientId ?? null,
      company_id: options?.companyId ?? null,
      template_id: template.id,
      template_version: template.version,
      name: template.name,
      instance_schema_json: template.schema_json,
      instance_data_json: {},
      status: "draft",
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as JobWorkpaperInstance;
}

/**
 * Create an additional workpaper instance for a job (e.g., extra schedule)
 */
export async function createAdditionalInstance(
  organizationId: string,
  jobId: string,
  templateId: string,
  options?: { clientId?: string; companyId?: string; name?: string }
): Promise<JobWorkpaperInstance> {
  const template = await getWorkpaperTemplate(templateId);
  if (!template) throw new Error("Template not found");

  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from("job_workpaper_instances")
    .insert({
      organization_id: organizationId,
      job_id: jobId,
      client_id: options?.clientId ?? null,
      company_id: options?.companyId ?? null,
      template_id: template.id,
      template_version: template.version,
      name: options?.name ?? template.name,
      instance_schema_json: template.schema_json,
      instance_data_json: {},
      status: "draft",
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as JobWorkpaperInstance;
}

/**
 * Update instance data (field values)
 */
export async function updateInstanceData(
  instanceId: string,
  data: Record<string, any>
): Promise<void> {
  const { error } = await supabase
    .from("job_workpaper_instances")
    .update({ instance_data_json: data })
    .eq("id", instanceId)
    .neq("status", "locked");

  if (error) throw error;
}

/**
 * Update instance status
 */
export async function updateInstanceStatus(
  instanceId: string,
  status: "draft" | "in_review" | "locked",
  reason?: string
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  const updates: Record<string, any> = { status };

  if (status === "locked") {
    updates.locked_at = new Date().toISOString();
    updates.locked_by = user?.id ?? null;
    updates.lock_reason = reason ?? null;
  } else if (status === "draft") {
    updates.locked_at = null;
    updates.locked_by = null;
    updates.lock_reason = null;
  }

  const { error } = await supabase
    .from("job_workpaper_instances")
    .update(updates)
    .eq("id", instanceId);

  if (error) throw error;
}

/**
 * Delete an instance (only if draft)
 */
export async function deleteWorkpaperInstance(instanceId: string): Promise<void> {
  const { error } = await supabase
    .from("job_workpaper_instances")
    .delete()
    .eq("id", instanceId)
    .eq("status", "draft");

  if (error) throw error;
}

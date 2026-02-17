/**
 * Job Artifacts Service — CRUD for job artifacts (documents, questionnaire submissions,
 * workpaper schedules, external workpapers, filing snapshots, computation outputs)
 */
import { supabase } from "@/integrations/supabase/client";

export type ArtifactType =
  | "document"
  | "questionnaire_submission"
  | "workpaper_schedule"
  | "external_workpaper"
  | "filing_snapshot"
  | "computation_output";

export type ArtifactStatus = "active" | "superseded" | "void";

export interface JobArtifact {
  id: string;
  organization_id: string;
  client_id: string | null;
  company_id: string | null;
  job_id: string;
  artifact_type: ArtifactType;
  source_document_id: string | null;
  source_questionnaire_id: string | null;
  title: string;
  period_label: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  locked_by: string | null;
  status: ArtifactStatus;
  version: number;
  metadata: Record<string, any>;
}

export interface CreateArtifactInput {
  organization_id: string;
  job_id: string;
  artifact_type: ArtifactType;
  title: string;
  client_id?: string;
  company_id?: string;
  source_document_id?: string;
  source_questionnaire_id?: string;
  period_label?: string;
  metadata?: Record<string, any>;
}

/**
 * List artifacts for a job, optionally filtered by type
 */
export async function listJobArtifacts(
  jobId: string,
  filters?: { artifactType?: ArtifactType; status?: ArtifactStatus }
): Promise<JobArtifact[]> {
  let query = supabase
    .from("job_artifacts")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (filters?.artifactType) {
    query = query.eq("artifact_type", filters.artifactType);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as JobArtifact[];
}

/**
 * Create a new job artifact
 */
export async function createJobArtifact(input: CreateArtifactInput): Promise<JobArtifact> {
  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from("job_artifacts")
    .insert({
      organization_id: input.organization_id,
      job_id: input.job_id,
      artifact_type: input.artifact_type,
      title: input.title,
      client_id: input.client_id ?? null,
      company_id: input.company_id ?? null,
      source_document_id: input.source_document_id ?? null,
      source_questionnaire_id: input.source_questionnaire_id ?? null,
      period_label: input.period_label ?? null,
      metadata: input.metadata ?? {},
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as JobArtifact;
}

/**
 * Tag a document to a job (creates a document artifact reference)
 */
export async function tagDocumentToJob(
  organizationId: string,
  jobId: string,
  documentId: string,
  documentTitle: string,
  options?: { clientId?: string; companyId?: string; periodLabel?: string }
): Promise<JobArtifact> {
  return createJobArtifact({
    organization_id: organizationId,
    job_id: jobId,
    artifact_type: "document",
    title: documentTitle,
    source_document_id: documentId,
    client_id: options?.clientId,
    company_id: options?.companyId,
    period_label: options?.periodLabel,
  });
}

/**
 * Update artifact status (e.g., void, superseded)
 */
export async function updateArtifactStatus(
  artifactId: string,
  status: ArtifactStatus
): Promise<void> {
  const { error } = await supabase
    .from("job_artifacts")
    .update({ status })
    .eq("id", artifactId);

  if (error) throw error;
}

/**
 * Lock an artifact (prevents edits)
 */
export async function lockArtifact(artifactId: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;

  const { error } = await supabase
    .from("job_artifacts")
    .update({
      locked_at: new Date().toISOString(),
      locked_by: user?.id ?? null,
    })
    .eq("id", artifactId);

  if (error) throw error;
}

/**
 * Delete an artifact (only if not locked)
 */
export async function deleteJobArtifact(artifactId: string): Promise<void> {
  const { error } = await supabase
    .from("job_artifacts")
    .delete()
    .eq("id", artifactId)
    .is("locked_at", null);

  if (error) throw error;
}

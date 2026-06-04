import { supabase } from "@/integrations/supabase/client";
import type { PortalDocument, PortalEntity } from "../types";
import { getSignedUrl } from "../utils/storage";

/**
 * Union of document sources the portal user can see for their entity:
 *  - job_documents WHERE client_visible = true (joined to jobs scoped to entity)
 *  - questionnaire_files via questionnaire_instances scoped to entity
 *  - onboarding_documents scoped to entity
 *  - engagement_letters scoped to entity
 *
 * downloadUrl is resolved lazily via resolvePortalDocumentUrl(doc) so we don't
 * mint signed URLs we never use.
 */
interface InternalDoc extends PortalDocument {
  _bucket: string;
  _path: string;
}

async function loadJobDocuments(entity: PortalEntity): Promise<InternalDoc[]> {
  // Find jobs for this entity, then job_documents WHERE client_visible.
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data: jobs } = await supabase.from("jobs").select("id").eq(col, entity.id);
  const jobIds = (jobs ?? []).map((j: any) => j.id);
  if (!jobIds.length) return [];
  const { data, error } = await supabase
    .from("job_documents")
    .select("id, file_name, file_path, uploaded_at, client_visible")
    .in("job_id", jobIds)
    .eq("client_visible", true)
    .eq("archived", false)
    .order("uploaded_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    source: "job_document",
    title: r.file_name,
    uploadedAt: r.uploaded_at,
    downloadUrl: null,
    description: null,
    _bucket: "job-documents",
    _path: r.file_path,
  }));
}

async function loadQuestionnaireFiles(entity: PortalEntity): Promise<InternalDoc[]> {
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data: instances } = await supabase
    .from("questionnaire_instances")
    .select("id")
    .eq(col, entity.id);
  const ids = (instances ?? []).map((i: any) => i.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("questionnaire_files")
    .select("id, file_name, file_path, uploaded_at")
    .in("questionnaire_instance_id", ids as string[])
    .order("uploaded_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    source: "questionnaire_file",
    title: r.file_name,
    uploadedAt: r.uploaded_at,
    downloadUrl: null,
    description: null,
    _bucket: "questionnaire-files",
    _path: r.file_path,
  }));
}

async function loadOnboardingDocuments(entity: PortalEntity): Promise<InternalDoc[]> {
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("onboarding_documents")
    .select("id, file_name, file_path, created_at")
    .eq(col, entity.id)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    source: "kyc_document",
    title: r.file_name,
    uploadedAt: r.created_at,
    downloadUrl: null,
    description: null,
    _bucket: "onboarding-documents",
    _path: r.file_path,
  }));
}

export async function listPortalDocuments(
  entity: PortalEntity | null,
): Promise<PortalDocument[]> {
  if (!entity) return [];
  const groups = await Promise.all([
    loadJobDocuments(entity),
    loadQuestionnaireFiles(entity),
    loadOnboardingDocuments(entity),
  ]);
  const merged = groups.flat();
  merged.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return merged;
}

/** Resolve a signed download URL for a previously-listed portal document. */
export async function resolvePortalDocumentUrl(
  doc: PortalDocument,
): Promise<string | null> {
  const internal = doc as InternalDoc;
  if (!internal._bucket || !internal._path) return null;
  return getSignedUrl(internal._bucket, internal._path);
}
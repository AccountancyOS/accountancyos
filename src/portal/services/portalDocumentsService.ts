import type { PortalDocument } from "../types";

// TODO(batch-2): union of job_documents + questionnaire_files + engagement_letters
// + kyc/onboarding documents, filtered by portal_access scope. Signed URLs only.
export async function listPortalDocuments(): Promise<PortalDocument[]> {
  return [];
}
import type { PortalUserContext, PortalClientProfile, PortalEntity } from "../types";

// TODO(batch-2): map to portal_access + accountant_client_links + clients/companies.
export async function getPortalUserContext(): Promise<PortalUserContext | null> {
  return null;
}

// TODO(batch-2): map to clients/companies via portal_access.
export async function getPortalClientProfile(): Promise<PortalClientProfile | null> {
  return null;
}

// TODO(batch-2): map to clients + companies the user has portal_access to.
export async function listPortalEntities(): Promise<PortalEntity[]> {
  return [];
}
import type { PortalQuestionnaire } from "../types";

// TODO(batch-2): map to questionnaire_instances scoped to the portal user.
export async function listPortalQuestionnaires(): Promise<PortalQuestionnaire[]> {
  return [];
}

export async function getPortalQuestionnaire(_id: string): Promise<PortalQuestionnaire | null> {
  return null;
}
import { supabase } from "@/integrations/supabase/client";
import type { PortalEntity, PortalQuestionnaire } from "../types";

/**
 * Questionnaires shown to portal users come from public.questionnaire_instances
 * scoped to the current entity. The response UI is the existing public token
 * page at /questionnaire/:instanceId?token=...
 */
export async function listPortalQuestionnaires(
  entity: PortalEntity | null,
): Promise<PortalQuestionnaire[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("questionnaire_instances")
    .select("id, name, status, token_expires_at, access_token, sent_at, submitted_at")
    .eq(col, entity.id)
    .order("sent_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    title: r.name,
    status: r.status,
    dueAt: r.token_expires_at,
    responseUrl: `/questionnaire/${r.id}?token=${encodeURIComponent(r.access_token)}`,
  }));
}

export async function getPortalQuestionnaire(
  id: string,
): Promise<PortalQuestionnaire | null> {
  const { data } = await supabase
    .from("questionnaire_instances")
    .select("id, name, status, token_expires_at, access_token")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.name,
    status: data.status,
    dueAt: data.token_expires_at,
    responseUrl: `/questionnaire/${data.id}?token=${encodeURIComponent(data.access_token)}`,
  };
}
import { supabase } from "@/integrations/supabase/client";

export type ChDiffStatus = "pending" | "accepted" | "rejected" | "superseded";

export interface ChDiff {
  id: string;
  organization_id: string;
  client_id: string | null;
  company_id: string | null;
  company_number: string;
  field_path: string;
  current_value: unknown;
  incoming_value: unknown;
  source: string;
  detected_at: string;
  status: ChDiffStatus;
  decision_notes: string | null;
}

export async function listPendingDiffs(organizationId: string): Promise<ChDiff[]> {
  const { data, error } = await supabase
    .from("companies_house_diff_staging")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("detected_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChDiff[];
}

export async function listDiffsForClient(clientId: string): Promise<ChDiff[]> {
  const { data, error } = await supabase
    .from("companies_house_diff_staging")
    .select("*")
    .eq("client_id", clientId)
    .order("detected_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChDiff[];
}

export async function decideDiff(diffId: string, decision: "accept" | "reject", notes?: string) {
  const { error } = await supabase.rpc("apply_ch_diff", {
    p_diff_id: diffId,
    p_decision: decision,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}
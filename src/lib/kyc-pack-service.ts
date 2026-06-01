import { supabase } from "@/integrations/supabase/client";

export type KycSubjectType =
  | "individual_client"
  | "director"
  | "partner"
  | "llp_member"
  | "trustee"
  | "psc"
  | "authorised_contact";

export type KycSubjectStatus =
  | "pending"
  | "documents_requested"
  | "partial"
  | "complete"
  | "waived"
  | "failed";

export interface KycSubjectInput {
  subject_type: KycSubjectType;
  subject_name: string;
  subject_ref_type?: "contact" | "director" | "free_text";
  subject_ref_id?: string | null;
  due_at?: string | null;
}

export async function startKycPack(clientId: string, subjects: KycSubjectInput[]) {
  const { data, error } = await supabase.rpc("start_kyc_pack", {
    p_client_id: clientId,
    p_subjects: subjects as any,
  });
  if (error) throw error;
  return data as string; // kyc_pack_id
}

export async function recordSubjectProgress(
  subjectId: string,
  newStatus: KycSubjectStatus,
  notes?: string,
) {
  const { error } = await supabase.rpc("record_kyc_subject_progress", {
    p_subject_id: subjectId,
    p_new_status: newStatus,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function getLatestKycPack(clientId: string) {
  const { data: pack } = await supabase
    .from("kyc_packs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pack) return null;
  const { data: subjects } = await supabase
    .from("kyc_pack_subjects")
    .select("*")
    .eq("kyc_pack_id", pack.id)
    .order("created_at", { ascending: true });
  return { pack, subjects: subjects ?? [] };
}

export function defaultSubjectsFor(
  clientType: string,
  contacts: Array<{ id: string; first_name?: string | null; last_name?: string | null; role?: string | null }>,
): KycSubjectInput[] {
  const list: KycSubjectInput[] = [];
  if (clientType === "individual" || clientType === "sole_trader") {
    list.push({ subject_type: "individual_client", subject_name: "Client", subject_ref_type: "free_text" });
  }
  for (const c of contacts) {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact";
    if (c.role === "Director") {
      list.push({ subject_type: "director", subject_name: name, subject_ref_type: "contact", subject_ref_id: c.id });
    } else if (c.role === "Bookkeeper" || c.role === "Other") {
      list.push({ subject_type: "authorised_contact", subject_name: name, subject_ref_type: "contact", subject_ref_id: c.id });
    }
  }
  return list;
}
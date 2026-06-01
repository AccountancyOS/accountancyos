import { supabase } from "@/integrations/supabase/client";

export async function markLeadDormant(leadId: string, reason?: string) {
  const { error } = await supabase.rpc("mark_lead_dormant", {
    p_lead_id: leadId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function markLeadLost(leadId: string, reason?: string) {
  const { error } = await supabase.rpc("mark_lead_lost", {
    p_lead_id: leadId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}
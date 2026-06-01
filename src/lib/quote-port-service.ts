import { supabase } from "@/integrations/supabase/client";

export async function portQuoteToClient(quoteId: string): Promise<string> {
  const { data, error } = await supabase.rpc("port_quote_to_client", { p_quote_id: quoteId });
  if (error) throw error;
  return data as string;
}

export async function getQuotePortStatus(quoteId: string) {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, status, ported_to_client_id, ported_at")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
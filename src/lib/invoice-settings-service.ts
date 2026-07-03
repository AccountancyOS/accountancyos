import { supabase } from "@/integrations/supabase/client";

export interface InvoiceSettings {
  id?: string;
  logo_url?: string | null;
  bank_account_name?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
  bank_reference?: string | null;
  payment_terms_days?: number;
  invoice_footer?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
}

export interface SettingsEntity {
  type: "client" | "company";
  id: string;
}

// Cast: invoice_settings is newer than the generated Supabase types.
const db = supabase as any;

async function resolveOrg(entity: SettingsEntity): Promise<string | null> {
  const tbl = entity.type === "client" ? "clients" : "companies";
  const { data } = await supabase.from(tbl as any).select("organization_id").eq("id", entity.id).maybeSingle();
  return (data as any)?.organization_id ?? null;
}

export async function getInvoiceSettings(entity: SettingsEntity): Promise<InvoiceSettings | null> {
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await db.from("invoice_settings").select("*").eq(col, entity.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertInvoiceSettings(entity: SettingsEntity, patch: InvoiceSettings): Promise<void> {
  const col = entity.type === "client" ? "client_id" : "company_id";
  const existing = await getInvoiceSettings(entity);
  if (existing?.id) {
    const { error } = await db.from("invoice_settings").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const org = await resolveOrg(entity);
  if (!org) throw new Error("Could not resolve organisation for this business");
  const { error } = await db.from("invoice_settings").insert({ organization_id: org, [col]: entity.id, ...patch });
  if (error) throw error;
}

/** Upload a logo to the public invoice-branding bucket under <entity_id>/… and return its URL. */
export async function uploadInvoiceLogo(entity: SettingsEntity, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${entity.id}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("invoice-branding").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("invoice-branding").getPublicUrl(path).data.publicUrl;
}

/**
 * Companies House Sync Service
 * Client-side service for interacting with CH sync edge function
 */

import { supabase } from "@/integrations/supabase/client";

export interface CHSyncResult {
  success: boolean;
  companyNumber: string;
  profile: CHCompanyProfile;
  officers: CHOfficer[];
  pscs: CHPSC[];
  discrepancies: CHDiscrepancy[];
  syncedAt: string;
}

export interface CHCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  type: string;
  date_of_creation: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
  };
}

export interface CHOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  links?: { self: string };
}

export interface CHPSC {
  name: string;
  natures_of_control: string[];
  notified_on: string;
  ceased_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  links?: { self: string };
}

export interface CHDiscrepancy {
  type: 
    | "officer_missing_internal" 
    | "officer_missing_ch" 
    | "psc_missing_internal" 
    | "psc_missing_ch"
    | "psc_control_mismatch";
  chData?: CHOfficer | CHPSC;
  internalData?: any;
  message: string;
}

/**
 * Trigger a Companies House sync for a company
 */
export async function syncCompanyWithCH(
  companyId: string,
  organizationId: string
): Promise<{ success: boolean; data?: CHSyncResult; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("companies-house-sync", {
      body: { companyId, organizationId },
    });

    if (error) {
      console.error("[CH Sync Service] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error("[CH Sync Service] Exception:", err);
    return { success: false, error: err.message || "Failed to sync with Companies House" };
  }
}

/**
 * Get the last CH sync data for a company from stored profile
 */
export async function getLastCHSyncData(
  companyId: string
): Promise<{
  profile?: CHCompanyProfile;
  officers?: CHOfficer[];
  pscs?: CHPSC[];
  syncedAt?: string;
} | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("ch_company_profile, ch_last_synced_at")
    .eq("id", companyId)
    .single();

  if (error || !data?.ch_company_profile) {
    return null;
  }

  const chProfile = data.ch_company_profile as any;
  return {
    profile: chProfile.profile,
    officers: chProfile.officers,
    pscs: chProfile.pscs,
    syncedAt: chProfile.synced_at || data.ch_last_synced_at,
  };
}

/**
 * Get register events for a company
 */
export async function getRegisterEvents(
  companyId: string,
  limit = 50
): Promise<any[]> {
  const { data, error } = await supabase
    .from("company_register_events")
    .select(`
      id,
      event_type,
      event_date,
      source,
      details,
      created_at,
      person:company_persons(id, first_name, last_name),
      officer:company_officers(id, role),
      psc:company_pscs(id),
      created_by
    `)
    .eq("company_id", companyId)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[CH Sync Service] Failed to fetch register events:", error);
    return [];
  }

  const events = data || [];

  // Enrich with actor profile (created_by FK points at auth.users, so PostgREST
  // can't embed profiles directly — do a small second query and merge).
  const actorIds = Array.from(
    new Set(events.map((e: any) => e.created_by).filter(Boolean)),
  ) as string[];

  if (actorIds.length === 0) return events;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", actorIds);

  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  return events.map((e: any) => ({
    ...e,
    created_by_profile: e.created_by ? byId.get(e.created_by) ?? null : null,
  }));
}

/**
 * Format PSC nature of control codes to human-readable text
 */
export function formatNatureOfControl(codes: string[]): string[] {
  const codeMap: Record<string, string> = {
    "ownership-of-shares-25-to-50-percent": "Owns 25-50% of shares",
    "ownership-of-shares-50-to-75-percent": "Owns 50-75% of shares",
    "ownership-of-shares-75-to-100-percent": "Owns 75-100% of shares",
    "voting-rights-25-to-50-percent": "Has 25-50% voting rights",
    "voting-rights-50-to-75-percent": "Has 50-75% voting rights",
    "voting-rights-75-to-100-percent": "Has 75-100% voting rights",
    "right-to-appoint-and-remove-directors": "Right to appoint/remove directors",
    "significant-influence-or-control": "Significant influence or control",
  };

  return codes.map(code => codeMap[code] || code);
}

/**
 * Format officer role to human-readable text
 */
export function formatOfficerRole(role: string): string {
  const roleMap: Record<string, string> = {
    director: "Director",
    secretary: "Secretary",
    llp_member: "LLP Member",
    llp_designated_member: "LLP Designated Member",
  };
  return roleMap[role] || role;
}

/**
 * Format event type to human-readable text
 */
export function formatEventType(eventType: string): string {
  const typeMap: Record<string, string> = {
    appointment: "Officer Appointed",
    termination: "Officer Terminated",
    resignation: "Officer Resigned",
    psc_added: "PSC Added",
    psc_ceased: "PSC Ceased",
    psc_updated: "PSC Updated",
    allotment: "Shares Allotted",
    transfer: "Shares Transferred",
    share_class_created: "Share Class Created",
    share_class_updated: "Share Class Updated",
    registered_office_changed: "Registered Office Changed",
    sic_codes_changed: "SIC Codes Changed",
    confirmation_statement_filed: "Confirmation Statement Filed",
    ch_sync: "Companies House Sync",
  };
  return typeMap[eventType] || eventType;
}

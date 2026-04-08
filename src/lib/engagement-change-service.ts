/**
 * Engagement Change Service
 * Detects fee/service changes on engagements and flags the need for a new engagement letter.
 * Works with the DB trigger `flag_engagement_letter_on_change` which auto-sets
 * `engagement_letter_required = true` when service_id or service_config changes.
 * 
 * This service provides client-side helpers for checking and resolving the flag.
 */

import { supabase } from "@/integrations/supabase/client";

interface EngagementLetterRequirement {
  engagementId: string;
  clientId?: string;
  companyId?: string;
  serviceName?: string;
  required: boolean;
}

/**
 * Check if any engagements for a client/company require a new engagement letter
 */
export async function getEngagementsRequiringLetter(
  organizationId: string,
  entityId: { clientId?: string; companyId?: string }
): Promise<EngagementLetterRequirement[]> {
  let query = supabase
    .from("engagements")
    .select("id, client_id, company_id, engagement_letter_required, services_catalog(name)")
    .eq("organization_id", organizationId)
    .eq("engagement_letter_required", true)
    .eq("status", "active");

  if (entityId.clientId) query = query.eq("client_id", entityId.clientId);
  if (entityId.companyId) query = query.eq("company_id", entityId.companyId);

  const { data, error } = await query;
  if (error) {
    console.error("[EngagementChange] Error checking EL requirements:", error);
    return [];
  }

  return (data || []).map((e: any) => ({
    engagementId: e.id,
    clientId: e.client_id,
    companyId: e.company_id,
    serviceName: e.services_catalog?.name,
    required: e.engagement_letter_required,
  }));
}

/**
 * Clear the engagement letter requirement after a new EL is signed
 */
export async function clearEngagementLetterRequirement(
  engagementId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("engagements")
    .update({ engagement_letter_required: false })
    .eq("id", engagementId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Check if any active engagements for an entity need a new engagement letter
 */
export async function hasOutstandingLetterRequirement(
  organizationId: string,
  entityId: { clientId?: string; companyId?: string }
): Promise<boolean> {
  const requirements = await getEngagementsRequiringLetter(organizationId, entityId);
  return requirements.length > 0;
}

import { supabase } from "@/integrations/supabase/client";

/**
 * Check if an entity has a specific service active via engagements
 */
export async function hasServiceForEntity(
  organizationId: string,
  entityType: 'client' | 'company',
  entityId: string,
  serviceCode: string
): Promise<boolean> {
  // Find service in services_catalog by code
  const { data: service } = await supabase
    .from("services_catalog")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", serviceCode)
    .single();

  if (!service) return false;

  // Check engagements for active engagement linking entity to that service
  const query = supabase
    .from("engagements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("service_id", service.id)
    .eq("status", "active");

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data: engagement } = await query.maybeSingle();
  return !!engagement;
}

/**
 * Get all active service codes for an entity
 */
export async function getActiveServicesForEntity(
  organizationId: string,
  entityType: 'client' | 'company',
  entityId: string
): Promise<string[]> {
  const query = supabase
    .from("engagements")
    .select(`
      service_id,
      services_catalog!inner(code)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data: engagements, error } = await query;

  if (error || !engagements) return [];

  // Extract unique service codes
  const serviceCodes = engagements
    .map((e: any) => e.services_catalog?.code)
    .filter(Boolean);

  return [...new Set(serviceCodes)] as string[];
}

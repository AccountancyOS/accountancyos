import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { getActiveServicesForEntity } from "@/lib/services-utils";

interface EntityServicesResult {
  hasPayroll: boolean;
  hasCIS: boolean;
  hasBookkeeping: boolean;
  services: string[];
  isLoading: boolean;
}

/**
 * Hook to check which services are active for an entity
 */
export function useEntityServices(
  entityType: 'client' | 'company' | null,
  entityId: string | null
): EntityServicesResult {
  const { organization } = useOrganization();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["entity-services", organization?.id, entityType, entityId],
    queryFn: async () => {
      if (!organization?.id || !entityType || !entityId) return [];
      return getActiveServicesForEntity(organization.id, entityType, entityId);
    },
    enabled: !!organization?.id && !!entityType && !!entityId,
    staleTime: 30000, // 30 seconds
  });

  return {
    hasPayroll: services.includes("PAYROLL"),
    hasCIS: services.includes("CIS"),
    hasBookkeeping: services.includes("BOOKKEEPING") || services.includes("BK-MONTHLY") || services.includes("BK-QUARTERLY"),
    services,
    isLoading,
  };
}

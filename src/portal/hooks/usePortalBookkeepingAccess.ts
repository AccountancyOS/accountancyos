import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalEntity } from "../contexts/PortalEntityContext";

/**
 * Returns whether the currently selected portal entity has the bookkeeping
 * service active. Backed by the `portal_has_bookkeeping` SECURITY DEFINER
 * RPC, which enforces portal access and service status server-side.
 */
export function usePortalBookkeepingAccess() {
  const { currentEntity } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "bookkeeping-access", currentEntity?.type, currentEntity?.id],
    queryFn: async (): Promise<boolean> => {
      if (!currentEntity) return false;
      const { data, error } = await supabase.rpc("portal_has_bookkeeping", {
        _entity_type: currentEntity.type,
        _entity_id: currentEntity.id,
      });
      if (error) {
        console.error("portal_has_bookkeeping failed", error);
        return false;
      }
      return Boolean(data);
    },
    enabled: !!currentEntity,
    staleTime: 60_000,
  });
}

/**
 * Aggregated flag — true if ANY entity the portal user can access has
 * bookkeeping active. Used for sidebar gating across entities.
 */
export function useAnyPortalBookkeepingAccess() {
  const { entities } = usePortalEntity();
  return useQuery({
    queryKey: ["portal", "bookkeeping-access-any", entities.map((e) => `${e.type}:${e.id}`).join(",")],
    queryFn: async (): Promise<boolean> => {
      if (entities.length === 0) return false;
      const checks = await Promise.all(
        entities.map((e) =>
          supabase.rpc("portal_has_bookkeeping", { _entity_type: e.type, _entity_id: e.id }),
        ),
      );
      return checks.some((c) => Boolean(c.data));
    },
    enabled: entities.length > 0,
    staleTime: 60_000,
  });
}
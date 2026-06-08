import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrgBankConnectionHealth {
  connection_id: string;
  organization_id: string;
  client_id: string | null;
  company_id: string | null;
  provider: string | null;
  bank_name: string | null;
  bank_logo_url: string | null;
  status: string | null;
  derived_status:
    | "connected"
    | "expiring_soon"
    | "expired"
    | "disconnected"
    | "sync_failed"
    | "action_required";
  consent_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  account_count: number;
}

export interface EntityBankConnectionHealth {
  connection_id: string;
  bank_name: string | null;
  bank_logo_url: string | null;
  derived_status: OrgBankConnectionHealth["derived_status"];
  consent_expires_at: string | null;
  last_synced_at: string | null;
  client_safe_message: string | null;
  account_count: number;
}

export function useOrgBankConnectionHealth(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["bank-connection-health", "org", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgBankConnectionHealth[]> => {
      const { data, error } = await supabase.rpc(
        "get_bank_connection_health_for_org" as never,
        { _org_id: orgId } as never,
      );
      if (error) throw error;
      return (data ?? []) as OrgBankConnectionHealth[];
    },
  });
}

export function useEntityBankConnectionHealth(
  clientId: string | null | undefined,
  companyId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["bank-connection-health", "entity", clientId, companyId],
    enabled: !!(clientId || companyId),
    queryFn: async (): Promise<EntityBankConnectionHealth[]> => {
      const { data, error } = await supabase.rpc(
        "get_bank_connection_health_for_entity" as never,
        { _client_id: clientId ?? null, _company_id: companyId ?? null } as never,
      );
      if (error) throw error;
      return (data ?? []) as EntityBankConnectionHealth[];
    },
  });
}
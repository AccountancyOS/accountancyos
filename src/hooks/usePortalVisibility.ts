import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";

export interface PortalVisibilitySettings {
  showRevenue: boolean;
  showProfit: boolean;
  showCash: boolean;
  showVATPosition: boolean;
  showCTEstimate: boolean;
  showReceivablesPayables: boolean;
  showTransactions: boolean;
}

const DEFAULT_VISIBILITY: PortalVisibilitySettings = {
  showRevenue: true,
  showProfit: true,
  showCash: true,
  showVATPosition: true,
  showCTEstimate: true,
  showReceivablesPayables: true,
  showTransactions: true,
};

export function usePortalVisibility(
  entityType: 'client' | 'company',
  entityId: string | undefined
) {
  const { organization } = useOrganization();

  return useQuery({
    queryKey: ['portal-visibility', organization?.id, entityType, entityId],
    queryFn: async (): Promise<PortalVisibilitySettings> => {
      if (!organization?.id || !entityId) {
        return DEFAULT_VISIBILITY;
      }

      // 1. Fetch org defaults
      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('setting_value')
        .eq('organization_id', organization.id)
        .eq('setting_key', 'portal_default_visibility')
        .maybeSingle();

      let settings = { ...DEFAULT_VISIBILITY };

      // Apply org defaults if they exist
      if (orgSettings?.setting_value) {
        const orgDefaults = orgSettings.setting_value as any;
        settings = {
          showRevenue: orgDefaults.show_revenue ?? settings.showRevenue,
          showProfit: orgDefaults.show_profit ?? settings.showProfit,
          showCash: orgDefaults.show_cash ?? settings.showCash,
          showVATPosition: orgDefaults.show_vat_position ?? settings.showVATPosition,
          showCTEstimate: orgDefaults.show_ct_estimate ?? settings.showCTEstimate,
          showReceivablesPayables: orgDefaults.show_receivables_payables ?? settings.showReceivablesPayables,
          showTransactions: orgDefaults.show_transactions ?? settings.showTransactions,
        };
      }

      // 2. Fetch entity-level overrides
      const entityFilter = entityType === 'client' 
        ? { client_id: entityId, company_id: null }
        : { client_id: null, company_id: entityId };

      const { data: entitySettings } = await supabase
        .from('portal_visibility_settings')
        .select('*')
        .eq('organization_id', organization.id)
        .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
        .maybeSingle();

      // 3. Apply entity overrides (non-null values only)
      if (entitySettings) {
        if (entitySettings.show_revenue !== null) settings.showRevenue = entitySettings.show_revenue;
        if (entitySettings.show_profit !== null) settings.showProfit = entitySettings.show_profit;
        if (entitySettings.show_cash !== null) settings.showCash = entitySettings.show_cash;
        if (entitySettings.show_vat_position !== null) settings.showVATPosition = entitySettings.show_vat_position;
        if (entitySettings.show_ct_estimate !== null) settings.showCTEstimate = entitySettings.show_ct_estimate;
        if (entitySettings.show_receivables_payables !== null) settings.showReceivablesPayables = entitySettings.show_receivables_payables;
        if (entitySettings.show_transactions !== null) settings.showTransactions = entitySettings.show_transactions;
      }

      return settings;
    },
    enabled: !!organization?.id && !!entityId,
  });
}

export function useUpdatePortalVisibility() {
  const { organization } = useOrganization();

  const updateEntityVisibility = async (
    entityType: 'client' | 'company',
    entityId: string,
    settings: Partial<PortalVisibilitySettings>
  ) => {
    if (!organization?.id) throw new Error('No organization');

    const dbSettings = {
      organization_id: organization.id,
      [entityType === 'client' ? 'client_id' : 'company_id']: entityId,
      show_revenue: settings.showRevenue,
      show_profit: settings.showProfit,
      show_cash: settings.showCash,
      show_vat_position: settings.showVATPosition,
      show_ct_estimate: settings.showCTEstimate,
      show_receivables_payables: settings.showReceivablesPayables,
      show_transactions: settings.showTransactions,
    };

    const { error } = await supabase
      .from('portal_visibility_settings')
      .upsert(dbSettings, {
        onConflict: entityType === 'client' 
          ? 'organization_id,client_id,company_id'
          : 'organization_id,client_id,company_id'
      });

    if (error) throw error;
  };

  const updateOrgDefaults = async (settings: Partial<PortalVisibilitySettings>) => {
    if (!organization?.id) throw new Error('No organization');

    const settingValue = {
      show_revenue: settings.showRevenue,
      show_profit: settings.showProfit,
      show_cash: settings.showCash,
      show_vat_position: settings.showVATPosition,
      show_ct_estimate: settings.showCTEstimate,
      show_receivables_payables: settings.showReceivablesPayables,
      show_transactions: settings.showTransactions,
    };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: organization.id,
        setting_key: 'portal_default_visibility',
        setting_value: settingValue,
      }, {
        onConflict: 'organization_id,setting_key'
      });

    if (error) throw error;
  };

  return { updateEntityVisibility, updateOrgDefaults };
}

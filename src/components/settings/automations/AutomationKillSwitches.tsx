import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";

export function OrgAutomationsMasterSwitch() {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  const { data: org } = useQuery({
    queryKey: ["org-automations-enabled", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("automations_enabled")
        .eq("id", organization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!organization?.id) return;
      const { error } = await supabase
        .from("organizations")
        .update({ automations_enabled: enabled })
        .eq("id", organization.id);
      if (error) throw error;
    },
    onSuccess: (_data, enabled) => {
      qc.invalidateQueries({ queryKey: ["org-automations-enabled"] });
      toast.success(enabled ? "Automations enabled" : "Automations paused for the whole practice");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Toggle failed"),
  });

  const enabled = org?.automations_enabled ?? true;

  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${enabled ? "" : "border-destructive/40 bg-destructive/5"}`}>
      <ShieldOff className={`h-4 w-4 ${enabled ? "text-muted-foreground" : "text-destructive"}`} />
      <div className="flex-1">
        <Label className="text-sm font-medium">Master Kill Switch</Label>
        <p className="text-xs text-muted-foreground">
          {enabled ? "All automations are live." : "All automations are paused practice-wide."}
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={(c) => toggle.mutate(c)} />
    </div>
  );
}

export function CategoryKillSwitch({ categoryKey, categoryLabel }: { categoryKey: string; categoryLabel: string }) {
  const { organization } = useOrganization();
  const qc = useQueryClient();

  const { data: setting } = useQuery({
    queryKey: ["category-automation-setting", organization?.id, categoryKey],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from("automation_category_settings")
        .select("id, is_enabled")
        .eq("organization_id", organization.id)
        .eq("category", categoryKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!organization?.id) return;
      const { error } = await supabase
        .from("automation_category_settings")
        .upsert(
          { organization_id: organization.id, category: categoryKey, is_enabled: enabled },
          { onConflict: "organization_id,category" }
        );
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      qc.invalidateQueries({ queryKey: ["category-automation-setting", organization?.id, categoryKey] });
      toast.success(`${categoryLabel} ${enabled ? "enabled" : "paused"}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Toggle failed"),
  });

  const enabled = setting?.is_enabled ?? true;

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch checked={enabled} onCheckedChange={(c) => toggle.mutate(c)} aria-label={`Enable ${categoryLabel}`} />
      <span className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</span>
    </div>
  );
}
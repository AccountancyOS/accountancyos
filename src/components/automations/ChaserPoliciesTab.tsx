/**
 * ChaserPoliciesTab: BrightManager-style chaser policy management.
 * Simple cards per service code — toggle on, pick template, set frequency.
 * No workflow steps, no conditions, no wait-until.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getTriggerDescription, getFrequencyLabel, type FrequencyUnit } from "@/lib/chaser-policy-service";
import { Mail, Clock, StopCircle, AlertTriangle } from "lucide-react";

interface ChaserPolicy {
  id: string;
  organization_id: string;
  service_code: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_offset_days: number;
  frequency_unit: string;
  frequency_interval: number;
  min_frequency_interval: number;
  max_frequency_interval: number;
  email_template_id: string | null;
  stop_condition_value: string;
  is_enabled: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
}

export function ChaserPoliciesTab() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chaser policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ["chaser-policies", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("automation_chaser_policies")
        .select("*")
        .eq("organization_id", organization.id)
        .order("name");
      if (error) throw error;
      return data as ChaserPolicy[];
    },
    enabled: !!organization?.id,
  });

  // Fetch email templates
  const { data: templates } = useQuery({
    queryKey: ["email-templates", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("templates")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("type", "email")
        .order("name");
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!organization?.id,
  });

  // Update policy mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: { id: string } & Partial<ChaserPolicy>) => {
      const { id, ...data } = updates;
      const { error } = await supabase
        .from("automation_chaser_policies")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chaser-policies"] });
    },
    onError: (error) => {
      toast({ title: "Error updating policy", description: error.message, variant: "destructive" });
    },
  });

  const handleToggleEnabled = (policy: ChaserPolicy) => {
    if (!policy.is_enabled && !policy.email_template_id) {
      toast({
        title: "Select an email template first",
        description: "You must choose an email template before enabling a chaser policy.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id: policy.id, is_enabled: !policy.is_enabled });
  };

  const handleTemplateChange = (policyId: string, templateId: string) => {
    updateMutation.mutate({
      id: policyId,
      email_template_id: templateId === "none" ? null : templateId,
    });
  };

  const handleFrequencyChange = (
    policyId: string,
    unit: FrequencyUnit,
    interval: number
  ) => {
    updateMutation.mutate({
      id: policyId,
      frequency_unit: unit,
      frequency_interval: interval,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!policies || policies.length === 0) {
    return (
      <div className="text-center py-12 mt-4">
        <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No chaser policies</h3>
        <p className="text-muted-foreground">
          Chaser policies will be created when your service catalog is set up.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 mt-4">
      {policies.map((policy) => (
        <ChaserPolicyCard
          key={policy.id}
          policy={policy}
          templates={templates || []}
          onToggleEnabled={handleToggleEnabled}
          onTemplateChange={handleTemplateChange}
          onFrequencyChange={handleFrequencyChange}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Policy Card
// ---------------------------------------------------------------------------

interface CardProps {
  policy: ChaserPolicy;
  templates: EmailTemplate[];
  onToggleEnabled: (policy: ChaserPolicy) => void;
  onTemplateChange: (policyId: string, templateId: string) => void;
  onFrequencyChange: (policyId: string, unit: FrequencyUnit, interval: number) => void;
}

function ChaserPolicyCard({
  policy,
  templates,
  onToggleEnabled,
  onTemplateChange,
  onFrequencyChange,
}: CardProps) {
  const frequencyOptions = buildFrequencyOptions(policy);

  return (
    <Card className={policy.is_enabled ? "border-primary/30" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{policy.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {policy.description}
            </p>
          </div>
          <Switch
            checked={policy.is_enabled}
            onCheckedChange={() => onToggleEnabled(policy)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trigger (read-only) */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            {getTriggerDescription(policy.trigger_type as any)}
            {policy.trigger_offset_days > 0 && ` (+${policy.trigger_offset_days} days)`}
          </span>
        </div>

        {/* Stop condition (read-only) */}
        <div className="flex items-center gap-2 text-sm">
          <StopCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Stops when job status = <Badge variant="outline" className="ml-1 text-xs">Records Received</Badge>
          </span>
        </div>

        {/* Frequency selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Reminder frequency</Label>
          <Select
            value={`${policy.frequency_unit}:${policy.frequency_interval}`}
            onValueChange={(val) => {
              const [unit, interval] = val.split(":");
              onFrequencyChange(policy.id, unit as FrequencyUnit, parseInt(interval, 10));
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {frequencyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Email template selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Email template</Label>
          <Select
            value={policy.email_template_id || "none"}
            onValueChange={(val) => onTemplateChange(policy.id, val)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template selected</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {policy.is_enabled && !policy.email_template_id && (
            <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
              <AlertTriangle className="h-3 w-3" />
              Template required for enabled policy
            </div>
          )}
        </div>

        {/* Service code badge */}
        <div className="pt-1">
          <Badge variant="secondary" className="text-xs">
            {policy.service_code}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Frequency Options Builder
// ---------------------------------------------------------------------------

function buildFrequencyOptions(policy: ChaserPolicy) {
  const options: { value: string; label: string }[] = [];
  
  // Daily options
  for (let i = Math.max(1, policy.min_frequency_interval); i <= Math.min(7, policy.max_frequency_interval); i++) {
    options.push({ value: `DAY:${i}`, label: getFrequencyLabel("DAY" as FrequencyUnit, i) });
  }
  // Weekly options
  for (let i = 1; i <= Math.min(4, policy.max_frequency_interval); i++) {
    options.push({ value: `WEEK:${i}`, label: getFrequencyLabel("WEEK" as FrequencyUnit, i) });
  }
  // Monthly options
  for (let i = 1; i <= Math.min(6, policy.max_frequency_interval); i++) {
    options.push({ value: `MONTH:${i}`, label: getFrequencyLabel("MONTH" as FrequencyUnit, i) });
  }

  return options;
}
